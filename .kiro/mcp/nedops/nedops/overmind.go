package nedops

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ProcfileEntry represents a service defined in the Procfile.
type ProcfileEntry struct {
	Name    string `json:"name"`
	Command string `json:"command"`
}

// ParseProcfile reads the Procfile at workspaceRoot/Procfile and returns service entries.
func ParseProcfile(workspaceRoot string) ([]ProcfileEntry, error) {
	f, err := os.Open(filepath.Join(workspaceRoot, "Procfile"))
	if err != nil {
		return nil, fmt.Errorf("opening Procfile: %w", err)
	}
	defer f.Close()

	var entries []ProcfileEntry
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		name, cmd, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		entries = append(entries, ProcfileEntry{
			Name:    strings.TrimSpace(name),
			Command: strings.TrimSpace(cmd),
		})
	}
	return entries, scanner.Err()
}

// RunOvermind executes an overmind command with cwd set to workspaceRoot.
// Extra env vars are appended to the current process environment.
func RunOvermind(workspaceRoot string, env []string, args ...string) (string, error) {
	cmd := exec.Command("overmind", args...)
	cmd.Dir = workspaceRoot
	if len(env) > 0 {
		cmd.Env = append(os.Environ(), env...)
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("overmind %s: %s: %w", args[0], strings.TrimSpace(string(out)), err)
	}
	return strings.TrimSpace(string(out)), nil
}

// WaitForSocket waits for .overmind.sock to appear in workspaceRoot.
func WaitForSocket(workspaceRoot string, timeout time.Duration) error {
	sock := filepath.Join(workspaceRoot, ".overmind.sock")
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(sock); err == nil {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("timed out waiting for .overmind.sock")
}

// ServiceStatus represents the parsed status of a single service.
type ServiceStatus struct {
	Name  string `json:"name"`
	State string `json:"state"`
}

// CaptureEcho captures recent log output from a running service using tmux capture-pane.
func CaptureEcho(workspaceRoot, service string, timeout time.Duration) (string, error) {
	// Find the most recent overmind tmux socket for this workspace
	uid := os.Getuid()
	dirName := filepath.Base(workspaceRoot)
	findCmd := exec.Command("sh", "-c", fmt.Sprintf("ls -t /tmp/tmux-%d/overmind-%s-* 2>/dev/null | head -1", uid, dirName))
	sockOut, err := findCmd.Output()
	if err != nil || len(strings.TrimSpace(string(sockOut))) == 0 {
		return "", fmt.Errorf("no overmind session found — is a service running?")
	}
	socketName := filepath.Base(strings.TrimSpace(string(sockOut)))

	cmd := exec.Command("tmux", "-L", socketName, "capture-pane", "-p", "-S", "-1000", "-t", fmt.Sprintf("%s:%s", dirName, service))
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("capturing logs for %s: %w", service, err)
	}
	return string(out), nil
}

// ParseOvermindStatus parses the column-aligned output of overmind status.
// Format: "PROCESS   PID       STATUS\ntool      6295      running\n"
func ParseOvermindStatus(output string) []ServiceStatus {
	var statuses []ServiceStatus
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		// Skip header row and lines with fewer than 3 fields
		if len(fields) < 3 || fields[0] == "PROCESS" {
			continue
		}
		statuses = append(statuses, ServiceStatus{
			Name:  fields[0],
			State: fields[2],
		})
	}
	return statuses
}
