// Package nedops — build_request.go contains the build_agent_run_request tool handler.
// Assembles a complete StartReActRunRequest JSON package for testing the
// agent → appian-tools → Go MCP → Java tools → LCP chain end-to-end.
// Writes the package to ~/.nedops/agent-run-request.json so the AI Platform
// NedOps can read and send it via send_agent_run.
package nedops

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// nedopsDir is the well-known directory for cross-repo request sharing.
const nedopsDir = ".nedops"

// requestFileName is the well-known filename for the agent run request.
const requestFileName = "agent-run-request.json"

// BuildAgentRunRequestInput is the input for the build_agent_run_request tool.
type BuildAgentRunRequestInput struct {
	AgentUUID    string   `json:"agent_uuid" jsonschema:"UUID of the agent (required, used for JWT claims)"`
	Query        string   `json:"query" jsonschema:"User query for the agent to process (required)"`
	SystemPrompt string   `json:"system_prompt,omitempty" jsonschema:"Custom system prompt for the agent"`
	Models       []string `json:"models,omitempty" jsonschema:"Model IDs in preference order (e.g. claude-3-5-sonnet-20241022)"`
	AgentsURL    string   `json:"agents_url,omitempty" jsonschema:"Override agents service URL. Default: http://localhost:8002"`
}

// BuildAgentRunRequestOutput is the output of the build_agent_run_request tool.
type BuildAgentRunRequestOutput struct {
	OK           bool   `json:"ok"`
	FilePath     string `json:"file_path"`
	Instructions string `json:"instructions"`
	ToolCount    int    `json:"tool_count"`
	URN          string `json:"urn"`
	GoServerURL  string `json:"go_server_url"`
}

// nedopsFilePath returns ~/.nedops/agent-run-request.json, creating the directory if needed.
func nedopsFilePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolving home directory: %w", err)
	}
	dir := filepath.Join(home, nedopsDir)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("creating %s: %w", dir, err)
	}
	return filepath.Join(dir, requestFileName), nil
}

// mcpToolsListResponse matches the JSON-RPC response from the Go MCP server's tools/list.
type mcpToolsListResponse struct {
	Result struct {
		Tools []struct {
			Name        string          `json:"name"`
			Description string          `json:"description"`
			InputSchema json.RawMessage `json:"inputSchema"`
		} `json:"tools"`
	} `json:"result"`
}

func (s *Server) handleBuildAgentRunRequest(ctx context.Context, _ *mcp.CallToolRequest, input BuildAgentRunRequestInput) (*mcp.CallToolResult, BuildAgentRunRequestOutput, error) {
	if input.AgentUUID == "" {
		return nil, BuildAgentRunRequestOutput{}, fmt.Errorf("agent_uuid is required")
	}
	if input.Query == "" {
		return nil, BuildAgentRunRequestOutput{}, fmt.Errorf("query is required")
	}

	// 1. Discover Go server URL from live config (BREQ-003)
	cfg := DiscoverServiceConfig(s.WorkspaceRoot, "mcp-server", true)
	mcpCfg, ok := cfg.Services["mcp-server"]
	if !ok {
		return nil, BuildAgentRunRequestOutput{}, fmt.Errorf("mcp-server not found in service config")
	}
	goServerURL := mcpCfg.Endpoints["mcp"]

	// 2. Get gdev JWT (BREQ-005) — reuse signJWT + gdevExtractAll directly
	info, err := s.gdevExtractAll(ctx)
	if err != nil {
		return nil, BuildAgentRunRequestOutput{}, err
	}
	lcpBaseURL := fmt.Sprintf("http://%s:8080/suite/lcp/api", info.IP)
	jwtToken, _, err := signJWT(info.PrivateKey, info.SiteID, input.AgentUUID, lcpBaseURL)
	if err != nil {
		return nil, BuildAgentRunRequestOutput{}, err
	}

	// 3. Fetch tool definitions via MCP tools/list through Go server (BREQ-002)
	mcpEndpoint := goServerURL + "/" + input.AgentUUID
	jsonRPCBody, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "tools/list",
	})

	client := &http.Client{Timeout: 30 * time.Second}
	req, _ := http.NewRequestWithContext(ctx, "POST", mcpEndpoint, bytes.NewReader(jsonRPCBody))
	req.Header.Set("Authorization", "Bearer "+jwtToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	resp, err := client.Do(req)
	if err != nil {
		return nil, BuildAgentRunRequestOutput{}, fmt.Errorf("fetching tools from %s: %w", mcpEndpoint, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, BuildAgentRunRequestOutput{}, fmt.Errorf("POST %s returned %d: %s", mcpEndpoint, resp.StatusCode, string(body))
	}

	var toolsList mcpToolsListResponse
	if err := json.Unmarshal(body, &toolsList); err != nil {
		return nil, BuildAgentRunRequestOutput{}, fmt.Errorf("parsing tools/list response: %w", err)
	}

	// 4. Compute URN (BREQ-003) — must include agentUuid in path so
	//    ai-platform's JsonRpcService POSTs to /mcp/{agentUuid}
	urn := "urn:remote:" + base64.StdEncoding.EncodeToString([]byte(mcpEndpoint)) + ":tools/call"

	// 5. Map tools to ToolDefinitions (BREQ-004)
	var tools []map[string]any
	for _, t := range toolsList.Result.Tools {
		tools = append(tools, map[string]any{
			"toolSpec": map[string]any{
				"name":        t.Name,
				"description": t.Description,
				"inputSchema": t.InputSchema,
			},
			"urn":                         urn,
			"static_tool_executor_params": map[string]string{"name": t.Name},
		})
	}

	// 6. Assemble package (BREQ-009, BREQ-010)
	agentsURL := input.AgentsURL
	if agentsURL == "" {
		agentsURL = "http://localhost:8002"
	}

	requestBody := map[string]any{
		"query": input.Query,
		"tools": tools,
		"tool_auth": map[string]string{
			"token":         jwtToken,
			"refresh_token": "",
			"refresh_url":   "http://localhost:8081/auth/token",
		},
	}
	if input.SystemPrompt != "" {
		requestBody["system_prompt"] = input.SystemPrompt
	}
	if len(input.Models) > 0 {
		requestBody["models"] = input.Models
	}

	// BREQ-006: placeholder for agents JWT
	pkg := map[string]any{
		"url":    agentsURL + "/agents/generic-react/runs",
		"method": "POST",
		"headers": map[string]string{
			"Authorization": "Bearer <AGENTS_JWT_HERE>",
			"Content-Type":  "application/json",
		},
		"body": requestBody,
	}

	pkgJSON, _ := json.MarshalIndent(pkg, "", "  ")

	// Write to ~/.nedops/agent-run-request.json
	filePath, err := nedopsFilePath()
	if err != nil {
		return nil, BuildAgentRunRequestOutput{}, err
	}
	if err := os.WriteFile(filePath, pkgJSON, 0644); err != nil {
		return nil, BuildAgentRunRequestOutput{}, fmt.Errorf("writing %s: %w", filePath, err)
	}

	return nil, BuildAgentRunRequestOutput{
		OK:        true,
		FilePath:  filePath,
		ToolCount: len(toolsList.Result.Tools),
		URN:       urn,
		GoServerURL: goServerURL,
		Instructions: fmt.Sprintf(
			"Request written to %s\n"+
				"Follow the playbook for next steps: docs/local-agent-testing-playbook.md",
			filePath),
	}, nil
}
