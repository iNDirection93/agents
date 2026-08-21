package nedops

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// MockExpectation defines a canned response for a method+path pattern.
type MockExpectation struct {
	ID       string       `json:"id"`
	Method   string       `json:"method"`
	Path     string       `json:"path"`
	Response MockResponse `json:"response"`
}

// MockResponse is the canned HTTP response for a matched expectation.
type MockResponse struct {
	Status int `json:"status"`
	Body   any `json:"body"`
}

// MockLCPServer manages the standalone mock-server binary as a child process.
// Controls it via HTTP admin API at /lcp/__admin/* and /kas/__admin/*.
type MockLCPServer struct {
	cmd     *exec.Cmd
	port    int
	binPath string
}

// Start spawns the mock-server binary on the given port. Non-blocking.
// Auto-builds the binary if missing or stale relative to source.
// Waits for /health to respond before returning.
func (m *MockLCPServer) Start(port int, workspaceRoot string) error {
	m.port = port
	m.binPath = filepath.Join(workspaceRoot, ".kiro", "bin", "mock-server")
	srcPath := filepath.Join(workspaceRoot, "docker", "mock-server", "main.go")

	if needsBuild(m.binPath, srcPath) {
		if err := buildMockServer(workspaceRoot, m.binPath); err != nil {
			return err
		}
	}

	m.cmd = exec.Command(m.binPath)
	m.cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", port))
	m.cmd.Stdout = io.Discard
	m.cmd.Stderr = io.Discard

	if err := m.cmd.Start(); err != nil {
		return fmt.Errorf("starting mock-server: %w", err)
	}

	if err := m.waitHealthy(10 * time.Second); err != nil {
		m.Stop()
		return err
	}
	return nil
}

// needsBuild returns true if the binary is missing or older than the source.
func needsBuild(binPath, srcPath string) bool {
	binInfo, err := os.Stat(binPath)
	if err != nil {
		return true
	}
	srcInfo, err := os.Stat(srcPath)
	if err != nil {
		return true
	}
	return srcInfo.ModTime().After(binInfo.ModTime())
}

// buildMockServer compiles the mock-server binary from source.
func buildMockServer(workspaceRoot, binPath string) error {
	srcDir := filepath.Join(workspaceRoot, "docker", "mock-server")
	cmd := exec.Command("go", "build", "-o", binPath, ".")
	cmd.Dir = srcDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("building mock-server: %s: %w", string(out), err)
	}
	return nil
}

// Stop kills the mock-server process.
func (m *MockLCPServer) Stop() {
	if m.cmd != nil && m.cmd.Process != nil {
		m.cmd.Process.Kill()
		m.cmd.Wait()
		m.cmd = nil
	}
}

// Running returns true if the mock-server process is alive and healthy.
func (m *MockLCPServer) Running() bool {
	if m.cmd == nil || m.cmd.Process == nil {
		return false
	}
	// Check if process is still alive by probing health endpoint
	client := &http.Client{Timeout: 1 * time.Second}
	resp, err := client.Get(m.adminURL("/health"))
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

// SetExpectation registers a mock expectation via HTTP admin API.
func (m *MockLCPServer) SetExpectation(e MockExpectation) error {
	body, _ := json.Marshal(e)
	resp, err := http.Post(m.adminURL("/lcp/__admin/set"), "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("setting mock expectation: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mock-server returned %d: %s", resp.StatusCode, b)
	}
	return nil
}

// ClearExpectation removes a single expectation by ID (clear all if id is empty).
func (m *MockLCPServer) ClearExpectation(id string) error {
	if id != "" {
		// Mock-server has no per-ID delete endpoint, so list → clear all → re-add the rest.
		expectations, err := m.ListExpectations()
		if err != nil {
			return err
		}
		if err := m.clearAll(); err != nil {
			return err
		}
		for _, e := range expectations {
			if e.ID != id {
				if err := m.SetExpectation(e); err != nil {
					return err
				}
			}
		}
		return nil
	}
	return m.clearAll()
}

func (m *MockLCPServer) clearAll() error {
	resp, err := http.Post(m.adminURL("/lcp/__admin/clear-all"), "application/json", nil)
	if err != nil {
		return fmt.Errorf("clearing mocks: %w", err)
	}
	defer resp.Body.Close()
	return nil
}

// ListExpectations returns all registered expectations.
func (m *MockLCPServer) ListExpectations() ([]MockExpectation, error) {
	resp, err := http.Get(m.adminURL("/lcp/__admin/list"))
	if err != nil {
		return nil, fmt.Errorf("listing mocks: %w", err)
	}
	defer resp.Body.Close()
	var out []MockExpectation
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decoding mock list: %w", err)
	}
	return out, nil
}

// PushKeys sends RSA public and private keys to the mock-server's KAS admin API.
func (m *MockLCPServer) PushKeys(publicKeyBase64, privateKeyPEM string) error {
	if err := m.postAdmin("/kas/__admin/set-key", publicKeyBase64); err != nil {
		return fmt.Errorf("pushing public key: %w", err)
	}
	if err := m.postAdmin("/kas/__admin/set-private-key", privateKeyPEM); err != nil {
		return fmt.Errorf("pushing private key: %w", err)
	}
	return nil
}

func (m *MockLCPServer) postAdmin(path, body string) error {
	resp, err := http.Post(m.adminURL(path), "text/plain", bytes.NewBufferString(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mock-server %s returned %d: %s", path, resp.StatusCode, b)
	}
	return nil
}

func (m *MockLCPServer) adminURL(path string) string {
	return fmt.Sprintf("http://localhost:%d%s", m.port, path)
}

func (m *MockLCPServer) waitHealthy(timeout time.Duration) error {
	client := &http.Client{Timeout: 1 * time.Second}
	deadline := time.Now().Add(timeout)
	url := m.adminURL("/health")
	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return nil
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("mock-server not healthy after %s", timeout)
}
