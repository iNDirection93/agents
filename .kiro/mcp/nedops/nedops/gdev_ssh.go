// Package nedops — gdev_ssh.go contains the SSH interaction layer for gdev mode.
// All gdev agent SSH commands are isolated here so the JWT handler (gdev_jwt.go)
// deals only with orchestration and signing logic.
//
// All three extractions (IP, siteId, private key) run in a single SSH session
// to avoid repeated connection overhead through VPN.
package nedops

import (
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// GdevInfo holds all values extracted from a single gdev SSH session.
type GdevInfo struct {
	IP         string
	SiteID     int
	PrivateKey string // PEM-formatted, never written to disk
}

// gdevExtractAll runs a single SSH session that extracts IP, siteId, and private key.
// Uses delimiters to parse the three values from one combined output.
func (s *Server) gdevExtractAll(ctx context.Context) (*GdevInfo, error) {
	if _, err := exec.LookPath("gdev"); err != nil {
		return nil, fmt.Errorf("gdev CLI not found. Install gdev: https://backstage.eng.appian-internal.com/")
	}

	// Single compound command with delimiters between sections
	compound := strings.Join([]string{
		`hostname -I | cut -d' ' -f1`,
		`echo '---SECTION---'`,
		`grep siteId suite/conf/custom.properties`,
		`echo '---SECTION---'`,
		`echo "-----BEGIN PRIVATE KEY-----" && mysql -u appian -pappian -h 127.0.0.1 AppianDB -N -s -e "SELECT TO_BASE64(serialized_key) FROM certificates WHERE alias = 'LCP_KAS_PRIVATE_KEY';" | sed 's/\\n//g' | fold -w 64 && echo "-----END PRIVATE KEY-----"`,
	}, "\n")

	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "gdev", "agent", "ssh")
	cmd.Dir = s.GdevRepoPath
	cmd.Stdin = strings.NewReader(compound)

	out, err := cmd.CombinedOutput()
	if err != nil {
		output := string(out)
		if ctx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("gdev SSH timed out (60s). Check VPN connection")
		}
		if strings.Contains(output, "requires a valid") && strings.Contains(output, "gdev.yaml") {
			return nil, fmt.Errorf("gdev.yaml not found at GDEV_REPO_PATH=%s. Set GDEV_REPO_PATH in .env.dev to your ae repo (e.g. ~/repo/ae)", s.GdevRepoPath)
		}
		return nil, fmt.Errorf("no running gdev agent. Run 'gdev start' or 'gdev snag' from your ae repo: %s", output)
	}

	cleaned := stripSSHNoise(string(out))
	sections := strings.SplitN(cleaned, "---SECTION---", 3)
	if len(sections) != 3 {
		return nil, fmt.Errorf("unexpected SSH output format (got %d sections, expected 3): %s", len(sections), cleaned)
	}

	// Parse IP
	ip := strings.TrimSpace(sections[0])
	if ip == "" {
		return nil, fmt.Errorf("gdev returned empty IP from hostname -I")
	}

	// Parse siteId
	siteIDLine := strings.TrimSpace(sections[1])
	_, val, ok := strings.Cut(siteIDLine, "=")
	if !ok {
		return nil, fmt.Errorf("unexpected siteId format: %s", siteIDLine)
	}
	siteID, err := strconv.Atoi(strings.TrimSpace(val))
	if err != nil {
		return nil, fmt.Errorf("parsing siteId %q: %w", val, err)
	}

	// Parse private key
	keySection := strings.TrimSpace(sections[2])
	if !strings.Contains(keySection, "BEGIN PRIVATE KEY") || !strings.Contains(keySection, "END PRIVATE KEY") {
		return nil, fmt.Errorf("private key not found in gdev MySQL. Webapp may not have finished KAS registration. Wait for webapp to be fully up, then retry. Look for 'KAS: Initial keypair successfully registered' in gdev logs")
	}
	begin := strings.Index(keySection, "-----BEGIN PRIVATE KEY-----")
	end := strings.Index(keySection, "-----END PRIVATE KEY-----")
	between := strings.TrimSpace(keySection[begin+len("-----BEGIN PRIVATE KEY-----") : end])
	if between == "" {
		return nil, fmt.Errorf("private key not found in gdev MySQL. Webapp may not have finished KAS registration. Wait for webapp to be fully up, then retry. Look for 'KAS: Initial keypair successfully registered' in gdev logs")
	}

	return &GdevInfo{
		IP:         ip,
		SiteID:     siteID,
		PrivateKey: keySection,
	}, nil
}

// stripSSHNoise removes gdev SSH wrapper lines, returning only command output.
// Known noise: "Logging in....", "Logged in....", "Pseudo-terminal...",
// "---------------", gdev WARNING blocks, "export" env hints, "unset" env hints,
// "Authorized uses only" banners, blank lines at start/end.
func stripSSHNoise(raw string) string {
	var lines []string
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.Contains(line, "Logging in"):
		case strings.Contains(line, "Logged in"):
		case strings.Contains(line, "Pseudo-terminal"):
		case trimmed == "---------------":
		case strings.Contains(line, "WARNING"):
		case strings.Contains(line, "mux_client_request_session"):
		case strings.HasPrefix(trimmed, "export "):
		case strings.HasPrefix(trimmed, "unset "):
		case strings.Contains(line, "Authorized uses only"):
		case strings.Contains(line, "All activity may be monitored"):
		default:
			lines = append(lines, line)
		}
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}
