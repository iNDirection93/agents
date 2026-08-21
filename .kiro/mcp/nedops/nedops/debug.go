package nedops

import (
	"context"
	"fmt"
	"io"
	"net"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// --- Input/Output types ---

type DebugAttachInput struct {
	BranchSlug string `json:"branch_slug,omitempty" jsonschema:"Branch slug (e.g. 'my-feature-branch'). If omitted, uses the current git branch."`
	Component  string `json:"component,omitempty" jsonschema:"Optional. One of: gateway, customer-mcp, internal-design. If omitted, attaches to all three."`
	Namespace  string `json:"namespace,omitempty" jsonschema:"Optional. Kubernetes namespace (default: tool-platform)."`
}

type DebugDetachInput struct {
	Component string `json:"component,omitempty" jsonschema:"Optional. Component to detach. If omitted, detaches all."`
}

type PortForward struct {
	Component  string `json:"component"`
	LocalPort  int    `json:"local_port"`
	RemotePort int    `json:"remote_port"`
	Deployment string `json:"deployment"`
}

type DebugAttachOutput struct {
	OK       bool          `json:"ok"`
	Forwards []PortForward `json:"forwards"`
	Message  string        `json:"message"`
}

type DebugDetachOutput struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

// debugForwards tracks active port-forward processes.
var (
	debugMu       sync.Mutex
	debugForwards = make(map[string]*exec.Cmd) // keyed by component
)

// portForwardSpec defines the port mapping for each component.
var portForwardSpec = map[string]struct {
	localPort  int
	remotePort int
	label      string // app.kubernetes.io/component label value
}{
	"gateway":          {2345, 2345, "gateway"},
	"customer-mcp":    {5005, 5005, "tool-server-customer-mcp"},
	"internal-design": {5006, 5005, "tool-server-internal-design"},
}

// resolveDeployment finds the deployment name by k8s labels using the
// app.kubernetes.io/instance label, which matches the Helm release name.
// The release name follows the same truncation as _helpers.tpl:
// "tool-platform-<slug>" truncated to 33 chars, trailing hyphens stripped.
func resolveDeployment(branchSlug, component, namespace string) (string, error) {
	spec := portForwardSpec[component]

	// Apply the same naming convention as charts: tool-platform-<slug> | trunc 33 | trimSuffix "-"
	instance := fmt.Sprintf("tool-platform-%s", branchSlug)
	if len(instance) > 33 {
		instance = instance[:33]
	}
	instance = strings.TrimRight(instance, "-")

	selector := fmt.Sprintf("app.kubernetes.io/instance=%s,app.kubernetes.io/component=%s", instance, spec.label)

	out, err := exec.Command("kubectl", "get", "deploy", "-n", namespace,
		"-l", selector,
		"-o", "jsonpath={.items[0].metadata.name}").CombinedOutput()
	if err != nil || strings.TrimSpace(string(out)) == "" {
		return "", fmt.Errorf("no deployment found (instance=%s, component=%s): %s", instance, component, string(out))
	}

	return strings.TrimSpace(string(out)), nil
}

func (s *Server) handleDebugAttach(_ context.Context, _ *mcp.CallToolRequest, input DebugAttachInput) (*mcp.CallToolResult, DebugAttachOutput, error) {
	if input.BranchSlug == "" {
		out, err := exec.Command("git", "-C", s.WorkspaceRoot, "branch", "--show-current").Output()
		if err != nil || strings.TrimSpace(string(out)) == "" {
			return nil, DebugAttachOutput{}, fmt.Errorf("branch_slug not provided and could not detect git branch")
		}
		// Convert branch name to slug (same as CI_COMMIT_REF_SLUG: lowercase, non-alphanum → hyphen)
		slug := strings.ToLower(strings.TrimSpace(string(out)))
		slug = strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
				return r
			}
			return '-'
		}, slug)
		slug = strings.Trim(slug, "-")
		input.BranchSlug = slug
	}

	ns := input.Namespace
	if ns == "" {
		ns = "tool-platform"
	}

	// Determine which components to forward
	components := []string{"gateway", "customer-mcp", "internal-design"}
	if input.Component != "" {
		if _, ok := portForwardSpec[input.Component]; !ok {
			return nil, DebugAttachOutput{}, fmt.Errorf("unknown component %q: must be gateway, customer-mcp, or internal-design", input.Component)
		}
		components = []string{input.Component}
	}

	// Kill existing forwards for these components (idempotent)
	killForwards(components)

	var forwards []PortForward
	for _, comp := range components {
		spec := portForwardSpec[comp]

		deployName, err := resolveDeployment(input.BranchSlug, comp, ns)
		if err != nil {
			killForwards(components)
			return nil, DebugAttachOutput{}, err
		}

		portArg := fmt.Sprintf("%d:%d", spec.localPort, spec.remotePort)

		// Use exec.Command (not CommandContext) — the port-forward must outlive this
		// request handler. The process is tracked in debugForwards and reaped by killForwards.
		cmd := exec.Command("kubectl", "port-forward", "deploy/"+deployName, portArg, "-n", ns)
		cmd.Stdout = io.Discard // Never inherit stdout — it's the JSON-RPC stream
		cmd.Stderr = io.Discard

		if err := cmd.Start(); err != nil {
			killForwards(components)
			return nil, DebugAttachOutput{}, fmt.Errorf("starting port-forward for %s: %w", comp, err)
		}

		debugMu.Lock()
		debugForwards[comp] = cmd
		debugMu.Unlock()

		// Poll the local port to confirm the tunnel is actually up
		if err := waitForPort(spec.localPort, cmd, 5*time.Second); err != nil {
			killForwards([]string{comp})
			return nil, DebugAttachOutput{}, fmt.Errorf("port-forward for %s started but tunnel not reachable on localhost:%d: %w", comp, spec.localPort, err)
		}

		forwards = append(forwards, PortForward{
			Component:  comp,
			LocalPort:  spec.localPort,
			RemotePort: spec.remotePort,
			Deployment: deployName,
		})
	}

	// Build message from actual forwards
	var parts []string
	for _, f := range forwards {
		parts = append(parts, fmt.Sprintf("%s → localhost:%d", f.Component, f.LocalPort))
	}

	return nil, DebugAttachOutput{
		OK:       true,
		Forwards: forwards,
		Message:  fmt.Sprintf("Port-forwards active: %s", strings.Join(parts, ", ")),
	}, nil
}

func (s *Server) handleDebugDetach(_ context.Context, _ *mcp.CallToolRequest, input DebugDetachInput) (*mcp.CallToolResult, DebugDetachOutput, error) {
	components := []string{"gateway", "customer-mcp", "internal-design"}
	if input.Component != "" {
		components = []string{input.Component}
	}

	killForwards(components)

	return nil, DebugDetachOutput{
		OK:      true,
		Message: fmt.Sprintf("Detached: %v", components),
	}, nil
}

func killForwards(components []string) {
	debugMu.Lock()
	defer debugMu.Unlock()

	for _, comp := range components {
		if cmd, ok := debugForwards[comp]; ok {
			if cmd.Process != nil {
				_ = cmd.Process.Kill()
				_ = cmd.Wait() // Reap zombie process
			}
			delete(debugForwards, comp)
		}
	}
}

// waitForPort polls a local TCP port until it accepts connections or times out.
// Also verifies the port-forward process is still running to avoid false positives
// from an unrelated process holding the port.
func waitForPort(port int, cmd *exec.Cmd, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	addr := fmt.Sprintf("localhost:%d", port)
	for time.Now().Before(deadline) {
		// Check the child process hasn't exited (non-blocking)
		if cmd.ProcessState != nil {
			return fmt.Errorf("port-forward process exited prematurely")
		}
		conn, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
		if err == nil {
			conn.Close()
			// Final check: process still alive after port opened
			if cmd.ProcessState != nil {
				return fmt.Errorf("port-forward process exited after port became reachable (port held by another process?)")
			}
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("timeout waiting for port %d", port)
}
