## ADDED Requirements

### Requirement: Agent dropdown includes current active id

The desktop sidebar agent identity control SHALL render a `<select>` whose option values are the union of the agent ids returned in the latest `AgentsList.agents` payload and the current active agent id string, with duplicates removed and ids sorted for stable display.

#### Scenario: Active id not present in agents array

- **WHEN** the UI holds `activeAgent` string A and `agentsList` contains only ids that do not exactly equal A (e.g. filesystem casing differs)
- **THEN** the dropdown SHALL still include an `<option>` with `value` equal to A so the controlled `select` value matches an option

#### Scenario: Agents list is empty

- **WHEN** `agentsList` is empty and `activeAgent` is non-empty
- **THEN** the dropdown SHALL show at least one option for `activeAgent`

### Requirement: User can pick another listed agent

The sidebar SHALL invoke the existing agent selection callback with the chosen option value when the user changes the `<select>`.

#### Scenario: Change selection

- **WHEN** the user selects a different agent id in the dropdown
- **THEN** the UI SHALL send `SetActiveAgent` with that id to the kernel through the existing bridge
