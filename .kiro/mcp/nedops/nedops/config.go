package nedops

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"
)

// ServiceConfig holds discovered config for a single service.
type ServiceConfig struct {
	Port        int               `json:"port"`
	Endpoints   map[string]string `json:"endpoints"`
	Healthy     bool              `json:"healthy"`
	API         *OASSummary       `json:"api,omitempty"`
	UpstreamAPI *OASSummary       `json:"upstream_api,omitempty"`
}

// ReadServiceConfigInput is the optional input for read_service_config.
type ReadServiceConfigInput struct {
	Service   string `json:"service,omitempty" jsonschema:"Optional service name (java-tools or mcp-server). If omitted, returns all services."`
	Debugging bool   `json:"debugging,omitempty" jsonschema:"When false (default), only surfaces the Go MCP server as the primary access plane when both services are running. Set to true to expose internal java-tools endpoints for debugging errors."`
}

// ReadServiceConfigOutput is the output of the read_service_config tool.
type ReadServiceConfigOutput struct {
	OK       bool                     `json:"ok"`
	Services map[string]ServiceConfig `json:"services"`
}

// serviceSpec maps service names to their OAS spec relative paths.
// "api" is the service's own API surface; "upstream" is the external API it calls.
var serviceSpec = map[string]struct{ api, upstream string }{
	"java-tools": {upstream: "src/main/resources/openapi/lcp-alpha.openapi.yaml"},
	"mcp-server": {api: ".kiro/mcp/nedops/specs/mcp-server.openapi.yaml"},
}

// serviceDefs defines the static config for each service.
type serviceDef struct {
	defaultPort int
	portEnvVar  string // env var that overrides defaultPort (e.g. "HTTP_PORT")
	endpoints   func(port int) map[string]string
}

var serviceDefs = map[string]serviceDef{
	"java-tools": {
		defaultPort: 8081,
		endpoints: func(port int) map[string]string {
			return map[string]string{
				"main":   fmt.Sprintf("http://localhost:%d", port),
				"health": fmt.Sprintf("http://localhost:%d/health", port),
				"tools":  fmt.Sprintf("http://localhost:%d/tools/list", port),
			}
		},
	},
	"customer-mcp": {
		defaultPort: 8083,
		endpoints: func(port int) map[string]string {
			return map[string]string{
				"main":   fmt.Sprintf("http://localhost:%d", port),
				"health": fmt.Sprintf("http://localhost:%d/health", port),
				"tools":  fmt.Sprintf("http://localhost:%d/tools/list", port),
			}
		},
	},
	"mcp-server": {
		defaultPort: 8082,
		portEnvVar:  "HTTP_PORT",
		endpoints: func(port int) map[string]string {
			return map[string]string{
				"main":   fmt.Sprintf("http://localhost:%d", port),
				"health": fmt.Sprintf("http://localhost:%d/health", port),
				"mcp":    fmt.Sprintf("http://localhost:%d/mcp", port),
			}
		},
	},
	"python-test": {
		defaultPort: 8084,
		endpoints: func(port int) map[string]string {
			return map[string]string{
				"main":   fmt.Sprintf("http://localhost:%d", port),
				"health": fmt.Sprintf("http://localhost:%d/health", port),
			}
		},
	},
	"python-native-test": {
		defaultPort: 8085,
		endpoints: func(port int) map[string]string {
			return map[string]string{
				"main":   fmt.Sprintf("http://localhost:%d", port),
				"health": fmt.Sprintf("http://localhost:%d/health", port),
			}
		},
	},
}

// resolvePort returns the env-overridden port, or the default.
func (d serviceDef) resolvePort() int {
	if d.portEnvVar != "" {
		if v, err := strconv.Atoi(os.Getenv(d.portEnvVar)); err == nil && v > 0 {
			return v
		}
	}
	return d.defaultPort
}

// DiscoverServiceConfig probes health endpoints and optionally parses OAS specs.
// When debugging is false and both services are running, only the mcp-server
// (Go) is surfaced — it's the primary access plane. The upstream_api spec is
// attached to it so callers still know the LCP API surface. Set debugging=true
// to expose internal java-tools endpoints for troubleshooting.
func DiscoverServiceConfig(workspaceRoot, service string, debugging bool) ReadServiceConfigOutput {
	client := &http.Client{Timeout: 2 * time.Second}

	out := ReadServiceConfigOutput{
		OK:       true,
		Services: make(map[string]ServiceConfig),
	}

	// Collect all requested services first.
	all := make(map[string]ServiceConfig)
	for name, def := range serviceDefs {
		if service != "" && name != service {
			continue
		}
		port := def.resolvePort()
		endpoints := def.endpoints(port)
		cfg := ServiceConfig{
			Port:      port,
			Endpoints: endpoints,
			Healthy:   probe(client, endpoints["health"]),
		}
		if specs, ok := serviceSpec[name]; ok {
			if specs.api != "" {
				if oas, err := ParseOASSpecFrom(workspaceRoot, specs.api); err == nil {
					cfg.API = oas
				}
			}
			if specs.upstream != "" {
				if oas, err := ParseOASSpecFrom(workspaceRoot, specs.upstream); err == nil {
					cfg.UpstreamAPI = oas
				}
			}
		}
		all[name] = cfg
	}

	// When not debugging and both services are present and healthy,
	// only surface mcp-server with the upstream_api attached.
	jt, hasJT := all["java-tools"]
	mc, hasMC := all["mcp-server"]
	if !debugging && hasJT && hasMC && jt.Healthy && mc.Healthy {
		if jt.UpstreamAPI != nil {
			mc.UpstreamAPI = jt.UpstreamAPI
		}
		out.Services["mcp-server"] = mc
	} else {
		out.Services = all
	}

	return out
}

func probe(client *http.Client, url string) bool {
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 400
}
