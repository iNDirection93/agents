.PHONY: build clean

BIN_DIR := ../../bin
WORKSPACE_ROOT := ../../..

build:
	@mkdir -p $(BIN_DIR)
	go build -o $(BIN_DIR)/nedops-mcp ./cmd/nedops-mcp
	cd $(WORKSPACE_ROOT)/docker/mock-server && go build -o $(abspath $(BIN_DIR))/mock-server .

clean:
	rm -f $(BIN_DIR)/nedops-mcp $(BIN_DIR)/mock-server
