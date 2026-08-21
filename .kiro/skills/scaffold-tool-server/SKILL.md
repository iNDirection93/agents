---
name: scaffold-tool-server
description: Scaffolds a new tool server module for the AI Tools Platform. Use when the user wants to create a new tool server, bootstrap a new MCP tool service, or says something like "create a new tool server", "scaffold a server", "I need a new tool module". Generates all required files (pom.xml, Application class, URN record, URN parser, starter handler, application.properties) and registers the module in the parent pom, Procfile, and .env.dev.
---

# scaffold-tool-server

This skill generates a complete, compilable tool server module for the AI Tools Platform. The output is ready to build and run locally with `dev-mock` profile.

## Inputs

Ask the user for:

1. **Service label** — the k8s routing key (e.g., `my-team`). Must be unique across all tool servers. This becomes the key in `TOOL_SERVER_URLS` and the k8s Service label.
2. **Module name** — the Maven module directory name (e.g., `my-team-tools`). Convention: `<service-label>-tools`.
3. **Java package suffix** — the last segment of `com.appiancorp.lcp.mcp.<suffix>` (e.g., `myteam`). No hyphens.
4. **First tool name** — the MCP tool name for the starter handler (e.g., `my_tool`). Must be globally unique, use underscores.

If the user provides a service label only, derive the rest:
- Module name: `<service-label>-tools`
- Package suffix: service label with hyphens removed (e.g., `my-team` → `myteam`)
- Tool name: ask (no good default)

## Files to Generate

All paths are relative to the repo root.

### 1. `<module>/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.appiancorp.lcp</groupId>
        <artifactId>lcp-mcp-tools-parent</artifactId>
        <version>0.1.0</version>
    </parent>

    <artifactId>{{module}}</artifactId>
    <packaging>jar</packaging>

    <name>{{Module Display Name}}</name>

    <dependencies>
        <dependency>
            <groupId>com.appiancorp.lcp</groupId>
            <artifactId>atp-sdk-tool-server-java-springboot</artifactId>
        </dependency>

        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

### 2. `<module>/src/main/java/com/appiancorp/lcp/mcp/<pkg>/<AppClass>.java`

```java
package com.appiancorp.lcp.mcp.{{pkg}};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.appiancorp.lcp.mcp.{{pkg}}")
public class {{AppClass}} {
  public static void main(String[] args) {
    SpringApplication.run({{AppClass}}.class, args);
  }
}
```

### 3. `<module>/src/main/resources/application.properties`

```properties
server.port=8081
mcp.sdk.kas-base-url=${KAS_BASE_URL:http://key-admin-service.key-admin-service.svc.cluster.local}
```

### 4. `<module>/src/main/java/com/appiancorp/lcp/mcp/<pkg>/urn/<UrnClass>.java`

```java
package com.appiancorp.lcp.mcp.{{pkg}}.urn;

import com.appiancorp.lcp.mcp.sdk.ToolUrn;

public record {{UrnClass}}(
    String raw,
    String scheme,
    String version,
    String serviceLabel,
    String toolName,
    String serverVersion
) implements ToolUrn {

    @Override
    public String handlerKey() {
        return toolName;
    }
}
```

### 5. `<module>/src/main/java/com/appiancorp/lcp/mcp/<pkg>/urn/<ParserClass>.java`

```java
package com.appiancorp.lcp.mcp.{{pkg}}.urn;

import com.appiancorp.lcp.mcp.sdk.MalformedToolUrnException;
import com.appiancorp.lcp.mcp.sdk.ToolUrnParser;
import org.springframework.stereotype.Component;

@Component
public class {{ParserClass}} implements ToolUrnParser<{{UrnClass}}> {

    private static final int REQUIRED_SEGMENTS = 5;

    @Override
    public {{UrnClass}} parse(String rawUrn) {
        if (rawUrn == null || rawUrn.isBlank()) {
            throw new MalformedToolUrnException("URN is null or blank");
        }

        String[] segments = rawUrn.split(":");
        if (segments.length < REQUIRED_SEGMENTS) {
            throw new MalformedToolUrnException(
                "Expected at least " + REQUIRED_SEGMENTS + " segments, got " + segments.length + ": " + rawUrn);
        }

        if (!"urn".equals(segments[0])) {
            throw new MalformedToolUrnException("Expected scheme 'urn', got '" + segments[0] + "': " + rawUrn);
        }
        if (!"v1".equals(segments[1])) {
            throw new MalformedToolUrnException("Expected version 'v1', got '" + segments[1] + "': " + rawUrn);
        }
        if (!"{{serviceLabel}}".equals(segments[2])) {
            throw new MalformedToolUrnException("Expected service label '{{serviceLabel}}', got '" + segments[2] + "': " + rawUrn);
        }

        return new {{UrnClass}}(
            rawUrn, segments[0], segments[1], segments[2], segments[3], segments[4]);
    }
}
```

### 6. `<module>/src/main/java/com/appiancorp/lcp/mcp/<pkg>/handler/<HandlerClass>.java`

```java
package com.appiancorp.lcp.mcp.{{pkg}}.handler;

import com.appiancorp.lcp.mcp.sdk.*;
import com.appiancorp.lcp.mcp.{{pkg}}.urn.{{UrnClass}};
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class {{HandlerClass}} implements ToolHandler<{{UrnClass}}> {

    @Override
    public Set<String> handlerKeys() {
        return Set.of("{{toolName}}");
    }

    @Override
    public List<ToolDefinition> listTools(List<{{UrnClass}}> urns, ToolExecutionContext context) {
        return List.of(new ToolDefinition(
            "{{toolName}}",
            "TODO: describe what this tool does",
            Map.of(
                "type", "object",
                "properties", Map.of(),
                "required", List.of()
            )
        ));
    }

    @Override
    public ToolResult call(List<{{UrnClass}}> urns, Map<String, Object> arguments, ToolExecutionContext context) {
        // TODO: implement tool logic
        return new ToolResult("hello from {{toolName}}", false);
    }
}
```

### 7. `<module>/src/main/java/com/appiancorp/lcp/mcp/<pkg>/discovery/<CapabilityProviderClass>.java`

This file is generated by default (pit of success) but is fully optional. Include a comment making this clear.

```java
package com.appiancorp.lcp.mcp.{{pkg}}.discovery;

import com.appiancorp.atp.sdk.tool.server.api.BareTemplate;
import com.appiancorp.atp.sdk.tool.server.api.BareToolCapability;
import com.appiancorp.atp.sdk.tool.server.features.CapabilityProvider;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Advertises this server's capabilities to the gateway discovery endpoint.
 *
 * <p>This is optional. If you don't need pre-auth discovery, delete this class —
 * the SDK auto-config is conditional and will simply not activate without it.
 * Your ToolHandler will still work normally.
 *
 * @see CapabilityProvider
 */
@Component
public class {{CapabilityProviderClass}} implements CapabilityProvider {

    @Override
    public BareToolCapability capability() {
        return new BareToolCapability(
            "{{serviceLabel}}",
            "{{Module Display Name}}",
            "TODO: describe what this server's tools can do"
        );
    }

    @Override
    public List<BareTemplate> templates() {
        return List.of(new BareTemplate(
            "{{serviceLabel}}",
            "{{toolName}}",
            "TODO: template title",
            "TODO: template description",
            BareTemplate.CardinalityEnum.ONE,
            Map.of("type", "object", "properties", Map.of())
        ));
    }
}
```

## Registration Steps

After generating the files, also:

### 8. Add to parent `pom.xml`

Insert `<module>{{module}}</module>` into the `<modules>` list in the root `pom.xml`.

### 9. Add to `Procfile`

Append a line:
```
{{serviceLabel}}: bash -c 'set -a; [ -f .env.dev ] && . .env.dev; [ -f .env.dev.local ] && . .env.dev.local; set +a; mvn install -DskipTests -q; exec mvn spring-boot:run -pl {{module}} -Dspring-boot.run.profiles=dev-mock -Dspring-boot.run.arguments="--server.port={{port}} --management.server.port={{mgmtPort}}"'
```

### 10. Add to `.env.dev`

Append the service to `TOOL_SERVER_URLS`:
```
TOOL_SERVER_URLS=...,{{serviceLabel}}=http://localhost:{{port}}
```

Add the port to the port map comment.

## Port Allocation

Read `.env.dev` to determine the next available port. Current allocations:
- 8081: design-object-tools
- 8082: Go gateway
- 8083: customer-mcp-tools
- 8084: platform-test-tools

Pick the next available (8085+). Management port follows `909x` pattern (9094+).

## Naming Conventions

Given service label `my-team`:
- Module: `my-team-tools`
- Package: `com.appiancorp.lcp.mcp.myteam` — all tool servers use the `com.appiancorp.lcp.mcp` prefix
- Application class: `MyTeamApplication`
- URN record: `MyTeamToolUrn`
- URN parser: `MyTeamToolUrnParser`
- Handler: `<ToolName>Handler` (PascalCase of tool name, e.g., `hello_world` → `HelloWorldHandler`)
- CapabilityProvider: `<AppPrefix>CapabilityProvider` (e.g., `MyTeamCapabilityProvider`)

## After Scaffolding

Tell the user:
1. The module is ready to compile: `mvn compile -pl <module> -am`
2. Run locally with: `overmind start -l <serviceLabel>` (or the full Procfile)
3. The generated `CapabilityProvider` advertises your tool to the gateway discovery endpoint. If you don't need pre-auth discovery, you can delete this class — the auto-config is conditional and will simply not activate.
4. Next steps: implement your tool logic in the handler, then follow the contributor guide for deployment (Dockerfile, Helm, CI, ECR image sync)

## Reference

See `docs/contributor-guide.md` for the full contributor guide. See `customer-mcp-tools/` for a working example.
