// Package nedops provides an MCP server for Flanders dev session management.
package nedops

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Server wraps the MCP server with dev session tool handlers.
type Server struct {
	WorkspaceRoot string
	GdevRepoPath  string
	mode          string // "mock", "gdev", or "lcp_url"
	activeLcpURL  string // set when mode is "lcp_url"
	server        *mcp.Server
	mockLCP       *MockLCPServer
}

// --- Input types ---

type EmptyInput struct{}

type ServiceNameInput struct {
	ServiceName string `json:"service_name,omitempty" jsonschema:"Optional. Service name from Procfile (e.g. java-tools, mcp-server). If omitted, starts all services."`
	LcpURL      string `json:"lcp_url,omitempty" jsonschema:"Optional. Real LCP base URL (e.g. https://my-site.appiancloud.com/suite). When provided, token exchange points at this site instead of the mock server."`
	Mode        string `json:"mode,omitempty" jsonschema:"Optional. Boot mode: 'mock' (local mock LCP), 'gdev' (real LCP via gdev), or a URL string (real LCP site via API key). If omitted, returns available options without starting."`
}

type LogsInput struct {
	Service string `json:"service" jsonschema:"Service name from Procfile"`
	Lines   int    `json:"lines,omitempty" jsonschema:"Number of recent log lines (default 50)"`
}

type HTTPRequestInput struct {
	Method  string            `json:"method" jsonschema:"HTTP method (GET, POST, PUT, DELETE)"`
	URL     string            `json:"url" jsonschema:"URL to request"`
	Body    map[string]any    `json:"body,omitempty" jsonschema:"Request body"`
	Headers map[string]string `json:"headers,omitempty" jsonschema:"Request headers"`
	Timeout int               `json:"timeout,omitempty" jsonschema:"Timeout in seconds (default 10)"`
}

type SetMockResponseInput struct {
	ID       string       `json:"id" jsonschema:"Unique ID for this expectation (for cleanup)"`
	Method   string       `json:"method" jsonschema:"HTTP method to match (GET, POST, etc.)"`
	Path     string       `json:"path" jsonschema:"URL path glob pattern (e.g. /api/v1/design-objects/agents/*)"`
	Response MockResponse `json:"response" jsonschema:"Canned response to return"`
}

type ClearMocksInput struct {
	ID string `json:"id,omitempty" jsonschema:"Expectation ID to remove. If empty, clears all."`
}

type SwitchInput struct {
	Mode string `json:"mode,omitempty" jsonschema:"Target mode: 'mock', 'gdev', or a URL string. If omitted, stops services and returns available options."`
}

type SetMockResponseOutput struct {
	OK      bool   `json:"ok"`
	ID      string `json:"id"`
	Message string `json:"message"`
}

type ClearMocksOutput struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

type ListMocksOutput struct {
	OK           bool              `json:"ok"`
	Expectations []MockExpectation `json:"expectations"`
}

// --- Output types ---

type ServicesOutput struct {
	OK       bool            `json:"ok"`
	Services []ProcfileEntry `json:"services"`
}

type StartOutput struct {
	OK      bool   `json:"ok"`
	Service string `json:"service"`
	Message string `json:"message"`
}

type StopOutput struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

type RestartOutput struct {
	OK       bool     `json:"ok"`
	Services []string `json:"services"`
	Message  string   `json:"message"`
}

type StatusOutput struct {
	OK       bool            `json:"ok"`
	Services []ServiceStatus `json:"services"`
}

type StubOutput struct {
	OK    bool   `json:"ok"`
	Error string `json:"error"`
}

type LogsOutput struct {
	OK    bool   `json:"ok"`
	Lines int    `json:"lines"`
	Log   string `json:"log"`
}

type HTTPRequestOutput struct {
	OK      bool              `json:"ok"`
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
	JSON    any               `json:"json,omitempty"`
}

type SwitchOutput struct {
	OK           bool   `json:"ok"`
	PreviousMode string `json:"previous_mode"`
	CurrentMode  string `json:"current_mode"`
	Message      string `json:"message"`
}

// NewServer creates a new NedOps MCP server. Mode is "mock" or "gdev".
func NewServer(workspaceRoot, mode, gdevRepoPath string) *Server {
	s := &Server{
		WorkspaceRoot: workspaceRoot,
		GdevRepoPath:  gdevRepoPath,
		mode:          mode,
		mockLCP:       &MockLCPServer{},
	}

	s.server = mcp.NewServer(&mcp.Implementation{
		Name:    "nedops",
		Version: "v0.1.0",
	}, nil)

	// --- Implemented tools ---

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "services",
		Description: "List all available services from the Procfile",
	}, s.handleServices)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "start",
		Description: "Start a dev session. If mode is provided, boots in that mode ('mock', 'gdev', or a URL for real LCP). If mode is omitted, returns available options. If service_name is provided, starts that service only.",
	}, s.handleStart)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "stop",
		Description: "Stop the dev session",
	}, s.handleStop)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "restart",
		Description: "Restart the currently running service",
	}, s.handleRestart)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "status",
		Description: "Get status of running services",
	}, s.handleStatus)

	// --- Stub tools (not yet implemented) ---

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "logs",
		Description: "Get recent logs from a service",
	}, s.handleLogs)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "read_service_config",
		Description: "Discover ports, endpoints, health status, and API surface for services. Optionally filter by service name. When both services are healthy, only the Go MCP server (primary access plane) is surfaced by default. Set debugging=true to expose internal java-tools endpoints for troubleshooting.",
	}, s.handleReadServiceConfig)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "http_request",
		Description: "Make an HTTP request to localhost",
	}, s.handleHTTPRequest)

	// --- Mock LCP tools (mock mode only) ---

	if mode == "mock" {
		s.addMockTools()
	}

	// --- Gdev tools (gdev mode only) ---

	if mode == "gdev" {
		s.addGdevTools()
	}

	// --- Always-registered tools ---

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "switch",
		Description: "Switch between modes at runtime. Stops running services, flips mode, manages mock LCP lifecycle, swaps mode-specific tools, and restarts services. If mode is omitted, stops services and returns available options.",
	}, s.handleSwitch)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "debug_attach",
		Description: "Start kubectl port-forward(s) to debug ports on a branch deployment. Returns local ports ready for IDE attachment. Targets: gateway (Delve :2345), customer-mcp (JDWP :5005), internal-design (JDWP :5006).",
	}, s.handleDebugAttach)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "debug_detach",
		Description: "Kill active debug port-forward(s). Safe no-op if not attached.",
	}, s.handleDebugDetach)

	return s
}

// addMockTools registers mock LCP tools (set_mock_response, clear_mocks, list_mocks).
func (s *Server) addMockTools() {
	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "set_mock_response",
		Description: "Stub an upstream LCP API response. When java-tools calls the LCP platform, the mock returns this instead. Path supports globs: * matches one segment, ** matches zero or more.",
	}, s.handleSetMockResponse)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "clear_mocks",
		Description: "Clear mock expectations. If id is provided, clears that one; otherwise clears all.",
	}, s.handleClearMocks)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "list_mocks",
		Description: "List all registered mock expectations.",
	}, s.handleListMocks)
}

// addGdevTools registers gdev-mode tools (get_jwt, build_agent_run_request).
func (s *Server) addGdevTools() {
	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "get_jwt",
		Description: "Generate a JWT for authenticating with the Java tools service via a running gdev instance. Requires a running gdev reservation with webapp up and KAS registration complete (gdev-pm contract).",
	}, s.handleGetJwt)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "build_agent_run_request",
		Description: "Build a complete StartReActRunRequest JSON package for testing the agent → tools → MCP chain. Gdev mode only. Requires services to be running.",
	}, s.handleBuildAgentRunRequest)
}

// Run starts the MCP server on stdio transport. Blocks until context is cancelled.
func (s *Server) Run(ctx context.Context) error {
	return s.server.Run(ctx, &mcp.StdioTransport{})
}

// --- Tool handlers ---

func (s *Server) handleServices(_ context.Context, _ *mcp.CallToolRequest, _ EmptyInput) (*mcp.CallToolResult, ServicesOutput, error) {
	entries, err := ParseProcfile(s.WorkspaceRoot)
	if err != nil {
		return nil, ServicesOutput{}, err
	}
	return nil, ServicesOutput{OK: true, Services: entries}, nil
}

func (s *Server) handleStart(ctx context.Context, req *mcp.CallToolRequest, input ServiceNameInput) (*mcp.CallToolResult, StartOutput, error) {
	// Resolve mode: use explicit input, fall back to lcp_url (legacy), fall back to prompt
	mode := input.Mode
	if mode == "" && input.LcpURL != "" {
		mode = input.LcpURL // legacy compat: treat lcp_url as mode
	}
	if mode == "" {
		return nil, StartOutput{
			OK:      true,
			Service: "",
			Message: "Which mode should I start in?\n\n" +
				"• mock — Local mock LCP on :9999 (fast iteration, no external deps)\n" +
				"• gdev — Real LCP via gdev reservation (integration testing)\n" +
				"• <url> — Real LCP site via API key (e.g. https://my-site.appiancloud.com/suite)\n\n" +
				"Call start(mode=\"mock\"), start(mode=\"gdev\"), or start(mode=\"https://...\") to proceed.",
		}, nil
	}

	// Determine effective mode category
	isURL := strings.HasPrefix(mode, "http://") || strings.HasPrefix(mode, "https://")
	if mode != "mock" && mode != "gdev" && !isURL {
		return nil, StartOutput{}, fmt.Errorf("invalid mode %q: must be 'mock', 'gdev', or a URL", mode)
	}

	entries, err := ParseProcfile(s.WorkspaceRoot)
	if err != nil {
		return nil, StartOutput{}, err
	}

	// If service_name provided, validate it exists
	if input.ServiceName != "" {
		found := false
		for _, e := range entries {
			if e.Name == input.ServiceName {
				found = true
				break
			}
		}
		if !found {
			names := make([]string, len(entries))
			for i, e := range entries {
				names[i] = e.Name
			}
			return nil, StartOutput{}, fmt.Errorf("service %q not found in Procfile. Available: %v", input.ServiceName, names)
		}
	}

	// Update server mode and swap tools if needed
	s.applyMode(mode)

	// Mock LCP server starts before services (only in mock mode)
	if s.mode == "mock" {
		if !s.mockLCP.Running() {
			if err := s.mockLCP.Start(9999, s.WorkspaceRoot); err != nil {
				return nil, StartOutput{}, fmt.Errorf("starting mock LCP server: %w", err)
			}
			if err := s.pushEphemeralKeys(); err != nil {
				return nil, StartOutput{}, fmt.Errorf("configuring mock KAS keys: %w", err)
			}
			if err := s.seedDefaultMocks(); err != nil {
				return nil, StartOutput{}, fmt.Errorf("seeding default mocks: %w", err)
			}
		}
	}

	// Build overmind args
	args := []string{"start", "-D"}
	if input.ServiceName != "" {
		args = append(args, "-l", input.ServiceName)
	}

	// Ensure dlv is installed (needed for mcp-server debug mode in Procfile)
	if input.ServiceName == "" || input.ServiceName == "mcp-server" {
		if _, err := exec.LookPath("dlv"); err != nil {
			// Auto-install Delve
			install := exec.Command("go", "install", "github.com/go-delve/delve/cmd/dlv@v1.27.0")
			install.Dir = s.WorkspaceRoot
			if out, installErr := install.CombinedOutput(); installErr != nil {
				return nil, StartOutput{}, fmt.Errorf("dlv not found and auto-install failed: %s", string(out))
			}
		}
	}

	// Extract gdev IP if needed for token exchange
	var gdevIP string
	if mode == "gdev" {
		info, err := s.gdevExtractAll(ctx)
		if err != nil {
			return nil, StartOutput{}, fmt.Errorf("extracting gdev info: %w", err)
		}
		gdevIP = info.IP
	}

	env := s.envForMode(mode, gdevIP)

	_, err = RunOvermind(s.WorkspaceRoot, env, args...)
	if err != nil {
		svc := input.ServiceName
		if svc == "" {
			svc = "all services"
		}
		return nil, StartOutput{}, fmt.Errorf("starting %s: %w", svc, err)
	}

	if err := WaitForSocket(s.WorkspaceRoot, 10*time.Second); err != nil {
		return nil, StartOutput{}, err
	}

	// Poll health endpoints until services are ready to accept traffic.
	var healthTargets []serviceHealth
	for name, def := range serviceDefs {
		if input.ServiceName != "" && name != input.ServiceName {
			continue
		}
		port := def.resolvePort()
		healthTargets = append(healthTargets, serviceHealth{
			Name:      name,
			HealthURL: def.endpoints(port)["health"],
		})
	}
	if len(healthTargets) > 0 {
		progressToken := req.Params.GetProgressToken()
		if err := waitForHealthy(ctx, req.Session, progressToken, healthTargets, 120*time.Second); err != nil {
			return nil, StartOutput{}, err
		}
	}

	svc := input.ServiceName
	msg := fmt.Sprintf("Dev session started in %s mode", mode)
	if svc == "" {
		svc = "all"
	} else {
		msg = fmt.Sprintf("Dev session started for '%s' in %s mode", svc, mode)
	}

	return nil, StartOutput{
		OK:      true,
		Service: svc,
		Message: msg,
	}, nil
}

func (s *Server) handleStop(_ context.Context, _ *mcp.CallToolRequest, _ EmptyInput) (*mcp.CallToolResult, StopOutput, error) {
	// First, try graceful shutdown via overmind
	_, err := RunOvermind(s.WorkspaceRoot, nil, "kill")
	if err != nil {
		return nil, StopOutput{}, err
	}

	// Wait up to 10 seconds for processes to die gracefully
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		cmd := exec.Command("pgrep", "-f", "spring-boot.*run|go run.*mcpServer")
		if err := cmd.Run(); err != nil {
			// pgrep returns non-zero if no processes found - this is success
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	// Force kill if still running
	cmd := exec.Command("pkill", "-9", "-f", "spring-boot.*run|go run.*mcpServer")
	_ = cmd.Run()

	// Stop mock LCP server if running (safe no-op if not started)
	s.mockLCP.Stop()

	return nil, StopOutput{OK: true, Message: "Dev session stopped"}, nil
}

func (s *Server) handleRestart(ctx context.Context, req *mcp.CallToolRequest, _ EmptyInput) (*mcp.CallToolResult, RestartOutput, error) {
	// Get running services first
	out, err := RunOvermind(s.WorkspaceRoot, nil, "status")
	if err != nil {
		return nil, RestartOutput{}, fmt.Errorf("getting status: %w", err)
	}

	statuses := ParseOvermindStatus(out)
	var running []string
	for _, s := range statuses {
		if s.State == "running" || s.State == "started" {
			running = append(running, s.Name)
		}
	}
	if len(running) == 0 {
		return nil, RestartOutput{}, fmt.Errorf("no services are currently running")
	}

	for _, name := range running {
		if _, err := RunOvermind(s.WorkspaceRoot, nil, "restart", name); err != nil {
			return nil, RestartOutput{}, fmt.Errorf("restarting %s: %w", name, err)
		}
	}

	// Poll health endpoints until restarted services are ready.
	var healthTargets []serviceHealth
	for _, name := range running {
		if def, ok := serviceDefs[name]; ok {
			port := def.resolvePort()
			healthTargets = append(healthTargets, serviceHealth{
				Name:      name,
				HealthURL: def.endpoints(port)["health"],
			})
		}
	}
	if len(healthTargets) > 0 {
		progressToken := req.Params.GetProgressToken()
		if err := waitForHealthy(ctx, req.Session, progressToken, healthTargets, 120*time.Second); err != nil {
			return nil, RestartOutput{}, err
		}
	}

	return nil, RestartOutput{
		OK:       true,
		Services: running,
		Message:  fmt.Sprintf("Restarted: %s", running),
	}, nil
}

func (s *Server) handleStatus(_ context.Context, _ *mcp.CallToolRequest, _ EmptyInput) (*mcp.CallToolResult, StatusOutput, error) {
	out, err := RunOvermind(s.WorkspaceRoot, nil, "status")
	if err != nil {
		return nil, StatusOutput{}, err
	}
	statuses := ParseOvermindStatus(out)

	// Enrich with "stopped" for Procfile services not reported by overmind
	reported := make(map[string]bool)
	for _, svc := range statuses {
		reported[svc.Name] = true
	}
	if entries, err := ParseProcfile(s.WorkspaceRoot); err == nil {
		for _, e := range entries {
			if !reported[e.Name] {
				statuses = append(statuses, ServiceStatus{Name: e.Name, State: "stopped"})
			}
		}
	}

	return nil, StatusOutput{OK: true, Services: statuses}, nil
}

func (s *Server) handleReadServiceConfig(_ context.Context, _ *mcp.CallToolRequest, input ReadServiceConfigInput) (*mcp.CallToolResult, ReadServiceConfigOutput, error) {
	return nil, DiscoverServiceConfig(s.WorkspaceRoot, input.Service, input.Debugging), nil
}

func (s *Server) handleLogs(_ context.Context, _ *mcp.CallToolRequest, input LogsInput) (*mcp.CallToolResult, LogsOutput, error) {
	lines := input.Lines
	if lines <= 0 {
		lines = 50
	}

	out, err := CaptureEcho(s.WorkspaceRoot, input.Service, 3*time.Second)
	if err != nil {
		return nil, LogsOutput{}, err
	}

	// Return last N lines
	allLines := strings.Split(strings.TrimRight(out, "\n"), "\n")
	if len(allLines) > lines {
		allLines = allLines[len(allLines)-lines:]
	}

	return nil, LogsOutput{
		OK:    true,
		Lines: len(allLines),
		Log:   strings.Join(allLines, "\n"),
	}, nil
}

func isLocalhost(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	host := u.Hostname()
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return nil
	}
	return fmt.Errorf("only localhost URLs allowed, got host %q", host)
}

func (s *Server) handleHTTPRequest(_ context.Context, _ *mcp.CallToolRequest, input HTTPRequestInput) (*mcp.CallToolResult, HTTPRequestOutput, error) {
	if err := isLocalhost(input.URL); err != nil {
		return nil, HTTPRequestOutput{}, err
	}

	timeout := time.Duration(input.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	client := &http.Client{Timeout: timeout}

	var bodyReader io.Reader
	if input.Body != nil {
		b, _ := json.Marshal(input.Body)
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(input.Method, input.URL, bodyReader)
	if err != nil {
		return nil, HTTPRequestOutput{}, err
	}
	if input.Body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range input.Headers {
		req.Header.Set(k, v)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, HTTPRequestOutput{}, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	headers := make(map[string]string)
	for k := range resp.Header {
		headers[k] = resp.Header.Get(k)
	}

	out := HTTPRequestOutput{
		OK:      true,
		Status:  resp.StatusCode,
		Headers: headers,
		Body:    string(body),
	}

	if strings.Contains(resp.Header.Get("Content-Type"), "json") {
		var parsed any
		if json.Unmarshal(body, &parsed) == nil {
			out.JSON = parsed
		}
	}

	return nil, out, nil
}

// --- Mode helpers ---

// applyMode sets the server mode and swaps mode-specific tools.
// mode is "mock", "gdev", or a URL string (treated as "lcp_url" internally).
func (s *Server) applyMode(mode string) {
	isURL := strings.HasPrefix(mode, "http://") || strings.HasPrefix(mode, "https://")
	newMode := mode
	if isURL {
		newMode = "lcp_url"
		s.activeLcpURL = mode
	} else {
		s.activeLcpURL = ""
	}

	prev := s.mode
	s.mode = newMode

	// Swap tools only on actual mode category change
	if prev == newMode {
		return
	}
	switch {
	case newMode == "mock":
		s.server.RemoveTools("get_jwt", "build_agent_run_request")
		s.addMockTools()
	case newMode == "gdev":
		s.server.RemoveTools("set_mock_response", "clear_mocks", "list_mocks")
		s.addGdevTools()
	case newMode == "lcp_url":
		s.server.RemoveTools("get_jwt", "build_agent_run_request")
		s.server.RemoveTools("set_mock_response", "clear_mocks", "list_mocks")
	}
}

// envForMode returns the environment variables for overmind based on the mode.
// gdevIP is required when mode is "gdev" (extracted via SSH beforehand).
func (s *Server) envForMode(mode, gdevIP string) []string {
	isURL := strings.HasPrefix(mode, "http://") || strings.HasPrefix(mode, "https://")
	if isURL {
		lcpURL := strings.TrimRight(mode, "/")
		tokenURL := lcpURL + "/lcp/api/auth/token"
		return []string{
			"SPRING_PROFILES_ACTIVE=dev-mock",
			"JWT_VALIDATION_ENABLED=false",
			"STATIC_SITE_MAP=localhost:8082=1",
			"_NEDOPS_TOKEN_EXCHANGE_URL=" + tokenURL,
			"TOKEN_EXCHANGE_URL_TEMPLATE=" + tokenURL,
		}
	}
	if mode == "mock" {
		return []string{
			"SPRING_PROFILES_ACTIVE=dev-mock",
			"JWT_VALIDATION_ENABLED=true",
			"STATIC_SITE_MAP=localhost:8082=1",
			"KAS_BASE_URL=http://localhost:9999/kas",
			"_NEDOPS_KAS_BASE_URL=http://localhost:9999/kas",
			"TOKEN_EXCHANGE_URL_TEMPLATE=http://localhost:9999/lcp/api/%s/auth/token",
			"_NEDOPS_TOKEN_EXCHANGE_URL=http://localhost:9999/lcp/api/%s/auth/token",
		}
	}
	// gdev — token exchange and KAS both point at gdev instance.
	// Validate gdevIP is a real IP address (catches SSH noise that leaked through stripSSHNoise).
	if net.ParseIP(gdevIP) == nil {
		panic(fmt.Sprintf("gdev IP %q is not a valid IP address — SSH noise leaked through stripSSHNoise", gdevIP))
	}
	gdevBase := fmt.Sprintf("http://%s:8080/suite", gdevIP)
	tokenURL := gdevBase + "/lcp/api/auth/token"
	return []string{
		"STATIC_SITE_MAP=localhost:8082=1",
		"KAS_BASE_URL=" + gdevBase + "/lcp/api/kas",
		"_NEDOPS_KAS_BASE_URL=" + gdevBase + "/lcp/api/kas",
		"TOKEN_EXCHANGE_URL_TEMPLATE=" + tokenURL,
		"_NEDOPS_TOKEN_EXCHANGE_URL=" + tokenURL,
	}
}

// --- Switch handler ---

func (s *Server) handleSwitch(ctx context.Context, req *mcp.CallToolRequest, input SwitchInput) (*mcp.CallToolResult, SwitchOutput, error) {
	prev := s.mode

	// Always stop running services
	s.handleStop(ctx, req, EmptyInput{})

	// If no mode provided, prompt
	if input.Mode == "" {
		// Stop mock LCP if it was running
		s.mockLCP.Stop()
		return nil, SwitchOutput{
			OK:           true,
			PreviousMode: prev,
			CurrentMode:  "",
			Message: "Services stopped. Which mode should I switch to?\n\n" +
				"• mock — Local mock LCP on :9999 (fast iteration, no external deps)\n" +
				"• gdev — Real LCP via gdev reservation (integration testing)\n" +
				"• <url> — Real LCP site via API key (e.g. https://my-site.appiancloud.com/suite)\n\n" +
				"Call switch(mode=\"mock\"), switch(mode=\"gdev\"), or switch(mode=\"https://...\") to proceed.",
		}, nil
	}

	// Validate mode
	isURL := strings.HasPrefix(input.Mode, "http://") || strings.HasPrefix(input.Mode, "https://")
	if input.Mode != "mock" && input.Mode != "gdev" && !isURL {
		return nil, SwitchOutput{}, fmt.Errorf("invalid mode %q: must be 'mock', 'gdev', or a URL", input.Mode)
	}

	// Stop mock LCP if switching away from mock
	if prev == "mock" && input.Mode != "mock" {
		s.mockLCP.Stop()
	}

	// Apply mode (sets s.mode, swaps tools)
	s.applyMode(input.Mode)

	// Boot mock LCP if switching to mock
	if s.mode == "mock" {
		if err := s.mockLCP.Start(9999, s.WorkspaceRoot); err != nil {
			return nil, SwitchOutput{}, fmt.Errorf("starting mock LCP server: %w", err)
		}
		if err := s.pushEphemeralKeys(); err != nil {
			return nil, SwitchOutput{}, fmt.Errorf("configuring mock KAS keys: %w", err)
		}
	}

	// Auto-start services in new mode
	var gdevIP string
	if input.Mode == "gdev" {
		info, err := s.gdevExtractAll(ctx)
		if err != nil {
			return nil, SwitchOutput{}, fmt.Errorf("extracting gdev info: %w", err)
		}
		gdevIP = info.IP
	}
	env := s.envForMode(input.Mode, gdevIP)
	args := []string{"start", "-D"}
	if _, err := RunOvermind(s.WorkspaceRoot, env, args...); err != nil {
		return nil, SwitchOutput{}, fmt.Errorf("starting services in %s mode: %w", input.Mode, err)
	}
	if err := WaitForSocket(s.WorkspaceRoot, 10*time.Second); err != nil {
		return nil, SwitchOutput{}, err
	}

	// Poll health endpoints until services are ready to accept traffic.
	var healthTargets []serviceHealth
	for name, def := range serviceDefs {
		port := def.resolvePort()
		healthTargets = append(healthTargets, serviceHealth{
			Name:      name,
			HealthURL: def.endpoints(port)["health"],
		})
	}
	progressToken := req.Params.GetProgressToken()
	if err := waitForHealthy(ctx, req.Session, progressToken, healthTargets, 120*time.Second); err != nil {
		return nil, SwitchOutput{}, err
	}

	return nil, SwitchOutput{
		OK:           true,
		PreviousMode: prev,
		CurrentMode:  input.Mode,
		Message:      fmt.Sprintf("Switched from %s to %s mode. Services are running.", prev, input.Mode),
	}, nil
}

// --- Mock LCP tool handlers ---

func (s *Server) handleSetMockResponse(_ context.Context, _ *mcp.CallToolRequest, input SetMockResponseInput) (*mcp.CallToolResult, SetMockResponseOutput, error) {
	if input.ID == "" {
		return nil, SetMockResponseOutput{}, fmt.Errorf("id is required")
	}
	if input.Method == "" {
		return nil, SetMockResponseOutput{}, fmt.Errorf("method is required")
	}
	if input.Path == "" {
		return nil, SetMockResponseOutput{}, fmt.Errorf("path is required")
	}

	if err := s.mockLCP.SetExpectation(MockExpectation{
		ID:       input.ID,
		Method:   input.Method,
		Path:     input.Path,
		Response: input.Response,
	}); err != nil {
		return nil, SetMockResponseOutput{}, err
	}

	return nil, SetMockResponseOutput{
		OK:      true,
		ID:      input.ID,
		Message: fmt.Sprintf("Mock registered: %s %s → %d", input.Method, input.Path, input.Response.Status),
	}, nil
}

func (s *Server) handleClearMocks(_ context.Context, _ *mcp.CallToolRequest, input ClearMocksInput) (*mcp.CallToolResult, ClearMocksOutput, error) {
	if err := s.mockLCP.ClearExpectation(input.ID); err != nil {
		return nil, ClearMocksOutput{}, err
	}
	if input.ID != "" {
		return nil, ClearMocksOutput{OK: true, Message: fmt.Sprintf("Cleared expectation: %s", input.ID)}, nil
	}
	return nil, ClearMocksOutput{OK: true, Message: "All expectations cleared"}, nil
}

func (s *Server) handleListMocks(_ context.Context, _ *mcp.CallToolRequest, _ EmptyInput) (*mcp.CallToolResult, ListMocksOutput, error) {
	expectations, err := s.mockLCP.ListExpectations()
	if err != nil {
		return nil, ListMocksOutput{}, err
	}
	return nil, ListMocksOutput{OK: true, Expectations: expectations}, nil
}

// pushEphemeralKeys generates an RSA keypair and pushes it to the mock-server
// so it can mint signed JWTs (token exchange) and serve matching public keys (KAS).
func (s *Server) pushEphemeralKeys() error {
	key, err := generateRSAKeyPair()
	if err != nil {
		return err
	}
	return s.mockLCP.PushKeys(key.PublicBase64, key.PrivatePEM)
}

// seedDefaultMocks registers default mock responses needed for local dev.
func (s *Server) seedDefaultMocks() error {
	return s.mockLCP.SetExpectation(MockExpectation{
		ID:     "_default_mcp_capabilities",
		Method: "GET",
		Path:   "/api/v1/configuration/features/mcp",
		Response: MockResponse{
			Status: 200,
			Body: map[string]interface{}{
				"enabled": true,
				"activeCategories": []string{
					"invokeProcessModel",
					"invokeExpressionRule",
					"invokeAgent",
					"queryDataFabric",
					"queryBusinessProcesses",
				},
			},
		},
	})
}
