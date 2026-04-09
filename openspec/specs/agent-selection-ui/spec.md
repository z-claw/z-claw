## Requirements

### Requirement: Agent dropdown includes current active id

The desktop sidebar agent identity control SHALL present a selectable list whose entries are the union of the agent ids returned in the latest `AgentsList.agents` payload and the current active agent id string, with duplicates removed and ids sorted for stable display.

#### Scenario: Active id not present in agents array

- **WHEN** the UI holds `activeAgent` string A and `agentsList` contains only ids that do not exactly equal A (e.g. filesystem casing differs)
- **THEN** the control SHALL still list A so the selected value matches an available entry

#### Scenario: Agents list is empty

- **WHEN** `agentsList` is empty and `activeAgent` is non-empty
- **THEN** the control SHALL show at least one entry for `activeAgent`

### Requirement: User can pick another listed agent

The sidebar SHALL invoke the existing agent selection callback with the chosen id when the user selects a different agent.

#### Scenario: Change selection

- **WHEN** the user chooses a different agent id in the control
- **THEN** the UI SHALL send `SetActiveAgent` with that id to the kernel through the existing bridge

### Requirement: Refresh agents when opening the picker

Opening the agent identity picker SHALL request an up-to-date agent list from the kernel (e.g. `ListAgents`) so workspace changes are reflected.

#### Scenario: Open picker

- **WHEN** the user opens the agent identity dropdown
- **THEN** the UI SHALL send `ListAgents` to the kernel
