// Package nedops — gdev_jwt.go contains JWT signing and the get_jwt tool handler.
// Orchestrates the SSH extraction functions (gdev_ssh.go) and signs a JWT
// compatible with McpJwtAuthenticator.
package nedops

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// GetJwtInput is the input for the get_jwt tool.
type GetJwtInput struct {
	AgentUUID  string `json:"agent_uuid" jsonschema:"UUID of the agent to include in JWT claims (required)"`
	LcpBaseURL string `json:"lcp_base_url,omitempty" jsonschema:"Override lcp_base_url claim. If empty, derived from gdev IP: http://<ip>:8080/suite/lcp/api"`
}

// GetJwtOutput is the output of the get_jwt tool.
type GetJwtOutput struct {
	OK         bool   `json:"ok"`
	JWT        string `json:"jwt"`
	ExpiresAt  string `json:"expires_at"`
	ExpiresIn  string `json:"expires_in"`
	SiteID     int    `json:"site_id"`
	LcpBaseURL string `json:"lcp_base_url"`
}

// signJWT produces a JWT matching McpJwtAuthenticator's validation requirements.
func signJWT(privateKeyPEM string, siteID int, agentUUID, lcpBaseURL string) (string, time.Time, error) {
	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return "", time.Time{}, fmt.Errorf("failed to decode private key from gdev. The key data may be corrupted — try restarting gdev")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("failed to parse private key: %w", err)
	}
	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return "", time.Time{}, fmt.Errorf("private key is not RSA")
	}

	now := time.Now()
	exp := now.Add(3 * time.Hour)

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub":                   "admin.user",
		"appian_site_id":        siteID,
		"appian_user_full_name": "admin.user",
		"aud":                   "urn:ai-platform",
		"iss":                   "integration-test",
		"lcp_base_url":          lcpBaseURL,
		"agent_uuid":            agentUUID,
		"iat":                   now.Unix(),
		"exp":                   exp.Unix(),
	})
	token.Header["appian_site_id"] = fmt.Sprintf("%d", siteID)

	signed, err := token.SignedString(rsaKey)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("JWT signing failed: %w. The private key from gdev may be invalid", err)
	}
	return signed, exp, nil
}

// handleGetJwt generates a JWT for authenticating with the Java tools service via gdev.
func (s *Server) handleGetJwt(ctx context.Context, _ *mcp.CallToolRequest, input GetJwtInput) (*mcp.CallToolResult, GetJwtOutput, error) {
	if input.AgentUUID == "" {
		return nil, GetJwtOutput{}, fmt.Errorf("agent_uuid is required")
	}

	info, err := s.gdevExtractAll(ctx)
	if err != nil {
		return nil, GetJwtOutput{}, err
	}

	lcpBaseURL := input.LcpBaseURL
	if lcpBaseURL == "" {
		lcpBaseURL = fmt.Sprintf("http://%s:8080/suite/lcp/api", info.IP)
	}

	if info.SiteID == -1 {
		return nil, GetJwtOutput{}, fmt.Errorf(
			"siteId is -1 — gdev-pm contract not set. " +
				"Run 'gdev contract set gdev-pm' then 'gdev start' from your ae repo")
	}

	signed, exp, err := signJWT(info.PrivateKey, info.SiteID, input.AgentUUID, lcpBaseURL)
	if err != nil {
		return nil, GetJwtOutput{}, err
	}

	return nil, GetJwtOutput{
		OK:         true,
		JWT:        signed,
		ExpiresAt:  exp.Format(time.RFC3339),
		ExpiresIn:  time.Until(exp).Round(time.Second).String(),
		SiteID:     info.SiteID,
		LcpBaseURL: lcpBaseURL,
	}, nil
}
