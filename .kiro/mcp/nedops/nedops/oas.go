package nedops

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// OASPathSummary is a compact summary of one API operation.
type OASPathSummary struct {
	Method      string   `json:"method"`
	Path        string   `json:"path"`
	OperationID string   `json:"operationId,omitempty"`
	Summary     string   `json:"summary,omitempty"`
	Parameters  []string `json:"parameters,omitempty"`
	RequestBody string   `json:"requestBody,omitempty"`
	Response    string   `json:"response,omitempty"`
}

// OASSummary holds the parsed API surface from an OpenAPI spec.
type OASSummary struct {
	Title   string           `json:"title"`
	Version string           `json:"version"`
	Paths   []OASPathSummary `json:"paths"`
}

// oasSpec is the minimal structure we need from the YAML.
type oasSpec struct {
	Info struct {
		Title   string `yaml:"title"`
		Version string `yaml:"version"`
	} `yaml:"info"`
	Paths map[string]map[string]oasOperation `yaml:"paths"`
}

type oasOperation struct {
	Summary     string         `yaml:"summary"`
	OperationID string         `yaml:"operationId"`
	Parameters  []oasParameter `yaml:"parameters"`
	RequestBody *oasReqBody    `yaml:"requestBody"`
	Responses   map[string]oasResponse `yaml:"responses"`
}

type oasParameter struct {
	Name string `yaml:"name"`
	In   string `yaml:"in"`
	Ref  string `yaml:"$ref"`
}

type oasReqBody struct {
	Content map[string]oasMediaType `yaml:"content"`
}

type oasResponse struct {
	Content map[string]oasMediaType `yaml:"content"`
}

type oasMediaType struct {
	Schema oasSchemaRef `yaml:"schema"`
}

type oasSchemaRef struct {
	Ref  string       `yaml:"$ref"`
	Type string       `yaml:"type"`
	Items *oasSchemaRef `yaml:"items"`
}

// ParseOASSpecFrom reads an OAS spec at the given relative path and returns a compact summary.
func ParseOASSpecFrom(workspaceRoot, relPath string) (*OASSummary, error) {
	specPath := filepath.Join(workspaceRoot, relPath)
	data, err := os.ReadFile(specPath)
	if err != nil {
		return nil, fmt.Errorf("reading OAS spec: %w", err)
	}

	var spec oasSpec
	if err := yaml.Unmarshal(data, &spec); err != nil {
		return nil, fmt.Errorf("parsing OAS spec: %w", err)
	}

	summary := &OASSummary{
		Title:   spec.Info.Title,
		Version: spec.Info.Version,
	}

	// Sorted paths for deterministic output
	pathKeys := make([]string, 0, len(spec.Paths))
	for p := range spec.Paths {
		pathKeys = append(pathKeys, p)
	}
	sort.Strings(pathKeys)

	methodOrder := []string{"get", "post", "put", "delete", "patch"}

	for _, path := range pathKeys {
		methods := spec.Paths[path]
		for _, m := range methodOrder {
			op, ok := methods[m]
			if !ok {
				continue
			}

			ps := OASPathSummary{
				Method:      strings.ToUpper(m),
				Path:        path,
				OperationID: op.OperationID,
				Summary:     op.Summary,
			}

			// Collect parameters (resolve common $ref names)
			for _, p := range op.Parameters {
				name := p.Name
				if name == "" && p.Ref != "" {
					name = refName(p.Ref)
				}
				if name != "" {
					ps.Parameters = append(ps.Parameters, name)
				}
			}

			// Request body schema
			if op.RequestBody != nil {
				if mt, ok := op.RequestBody.Content["application/json"]; ok {
					ps.RequestBody = schemaName(mt.Schema)
				}
			}

			// Success response schema (first 2xx)
			for code, resp := range op.Responses {
				if len(code) == 3 && code[0] == '2' {
					if mt, ok := resp.Content["application/json"]; ok {
						ps.Response = schemaName(mt.Schema)
						break
					}
				}
			}

			summary.Paths = append(summary.Paths, ps)
		}
	}

	return summary, nil
}

// refName extracts the last segment from a $ref like "#/components/schemas/Agent".
func refName(ref string) string {
	parts := strings.Split(ref, "/")
	return parts[len(parts)-1]
}

// schemaName returns a human-readable name for a schema reference.
func schemaName(s oasSchemaRef) string {
	if s.Ref != "" {
		return refName(s.Ref)
	}
	if s.Type == "array" && s.Items != nil {
		return "[]" + schemaName(*s.Items)
	}
	return s.Type
}
