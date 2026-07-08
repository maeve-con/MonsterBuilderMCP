#Monster MCP Server

A MCP server that allows a connected LLM to create monsters using the
monster pieces found in the Kenney Assets [Monster Builder Pack](https://kenney.nl/assets/monster-builder-pack).

```
MCP client ──(stdio)──> Phaser MCP server (Node)
                      │  also runs a WebSocket server on port 8081
                      ▲
                      │  (WebSocket — the browser connects outward)
              Phaser game (browser)
```

index.js - MCP server

main.js - Phaser entry

scene.js - Phaser game scene (puts monster parts on screen)

## To Run

Start the Phaser game by starting a server running with index.html

Start the MCP server
