package nedops

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// serviceHealth tracks health polling state for a single service.
type serviceHealth struct {
	Name       string
	HealthURL  string
	Ready      bool
	LastStatus string
}

// waitForHealthy polls health endpoints for the requested services, sending
// MCP progress notifications as each service becomes ready. It blocks until
// all services are healthy or the timeout expires.
func waitForHealthy(ctx context.Context, session *mcp.ServerSession, progressToken any, services []serviceHealth, timeout time.Duration) error {
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(timeout)
	total := float64(len(services))
	ready := 0.0

	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		allReady := true
		for i := range services {
			if services[i].Ready {
				continue
			}
			resp, err := client.Get(services[i].HealthURL)
			if err != nil {
				services[i].LastStatus = "connecting..."
				allReady = false
				continue
			}
			resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 400 {
				services[i].Ready = true
				ready++
				services[i].LastStatus = "ready"
				notifyProgress(ctx, session, progressToken, ready, total,
					fmt.Sprintf("%s: ready ✓", services[i].Name))
			} else {
				services[i].LastStatus = fmt.Sprintf("starting (HTTP %d)...", resp.StatusCode)
				allReady = false
			}
		}
		if allReady {
			return nil
		}
		// Report waiting status for services not yet ready
		for _, svc := range services {
			if !svc.Ready {
				notifyProgress(ctx, session, progressToken, ready, total,
					fmt.Sprintf("%s: %s", svc.Name, svc.LastStatus))
				break // report one pending service per tick
			}
		}
		time.Sleep(2 * time.Second)
	}

	// Build error with which services failed
	var pending []string
	for _, svc := range services {
		if !svc.Ready {
			pending = append(pending, svc.Name)
		}
	}
	return fmt.Errorf("timed out waiting for services to become healthy: %v", pending)
}

// notifyProgress sends a progress notification if session is available.
// Silently no-ops if session is nil or notification fails.
func notifyProgress(ctx context.Context, session *mcp.ServerSession, progressToken any, progress, total float64, message string) {
	if session == nil {
		return
	}
	params := &mcp.ProgressNotificationParams{
		Progress: progress,
		Total:    total,
		Message:  message,
	}
	if progressToken != nil {
		params.ProgressToken = progressToken
	}
	// Best-effort — don't fail the operation if notification fails
	_ = session.NotifyProgress(ctx, params)
}
