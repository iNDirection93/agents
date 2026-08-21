package nedops

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
)

// RSAKeyPair holds an ephemeral RSA keypair in the formats the mock-server expects.
type RSAKeyPair struct {
	PublicBase64 string // DER-encoded public key, base64
	PrivatePEM   string // PKCS1 PEM-encoded private key
}

// generateRSAKeyPair creates a 2048-bit RSA keypair for mock KAS.
func generateRSAKeyPair() (*RSAKeyPair, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("generating RSA key: %w", err)
	}

	pubDER, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("marshaling public key: %w", err)
	}

	privPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})

	return &RSAKeyPair{
		PublicBase64: base64.StdEncoding.EncodeToString(pubDER),
		PrivatePEM:  string(privPEM),
	}, nil
}
