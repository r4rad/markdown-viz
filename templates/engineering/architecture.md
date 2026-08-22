---
pack: engineering
docType: architecture
titlePattern: "Architecture — {{title}}"
---
# {{title}}

Workspace: {{workspace}}

## System context

```mermaid
flowchart LR
  User --> App --> Store
```

## Component sketch (DOT)

```dot
digraph G {
  User -> App;
  App -> Store;
}
```

## Interaction (Nomnoml)

```nomnoml
[User] -> [App]
[App] -> [Store]
```
