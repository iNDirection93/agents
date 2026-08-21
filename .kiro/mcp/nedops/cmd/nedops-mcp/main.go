// Command nedops-mcp runs the NedOps MCP server for Flanders dev sessions.
package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"

	"nedops/nedops"
)

// loadEnvFile reads a KEY=VALUE file and sets env vars that aren't already set.
// Existing env vars take precedence (so flanders.json can still override).
func loadEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if k, v, ok := strings.Cut(line, "="); ok {
			if _, exists := os.LookupEnv(k); !exists {
				os.Setenv(k, v)
			}
		}
	}
}

func main() {
	wsRoot := os.Getenv("WORKSPACE_ROOT")
	if wsRoot == "" {
		fmt.Fprintln(os.Stderr, "nedops-mcp: WORKSPACE_ROOT not set")
		os.Exit(1)
	}
	if strings.HasPrefix(wsRoot, "~/") {
		home, _ := os.UserHomeDir()
		wsRoot = filepath.Join(home, wsRoot[2:])
	}
	wsRoot, _ = filepath.Abs(wsRoot)

	// Load .env.dev.local (personal overrides, gitignored) first, then .env.dev (checked-in defaults).
	// loadEnvFile is first-wins, so local overrides take precedence — matching Procfile's source order.
	loadEnvFile(filepath.Join(wsRoot, ".env.dev.local"))
	loadEnvFile(filepath.Join(wsRoot, ".env.dev"))

	mode := os.Getenv("NEDOPS_MODE")
	if mode == "" {
		mode = "mock"
	}

	gdevRepoPath := os.Getenv("GDEV_REPO_PATH")
	if gdevRepoPath == "" {
		home, _ := os.UserHomeDir()
		gdevRepoPath = filepath.Join(home, "repo", "ae")
	}
	if strings.HasPrefix(gdevRepoPath, "~/") {
		home, _ := os.UserHomeDir()
		gdevRepoPath = filepath.Join(home, gdevRepoPath[2:])
	}

	srv := nedops.NewServer(wsRoot, mode, gdevRepoPath)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	fmt.Fprintf(os.Stderr, "[nedops-mcp] Running stdio transport (mode=%s)...\n", mode)
	if err := srv.Run(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "nedops-mcp: %v\n", err)
		os.Exit(1)
	}
	fmt.Fprintln(os.Stderr, "[nedops-mcp] Server exited normally")
}
