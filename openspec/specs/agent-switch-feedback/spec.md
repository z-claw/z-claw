## Requirements

### Requirement: Failed agent switch surfaces an error event

When the kernel handles `SetActiveAgent` and cannot load the agent profile for the requested id, it SHALL emit `KernelEvent::Error` with a message that identifies the agent id and includes the underlying failure reason.

#### Scenario: Profile missing or unreadable

- **WHEN** `load_agent_profile(agent_id)` returns an error
- **THEN** the kernel SHALL NOT update `active_agent_id` and SHALL send `KernelEvent::Error` with a descriptive `message` field

### Requirement: Desktop shows kernel Error to the user

The desktop application SHALL display user-visible feedback when it receives `KernelEvent::Error` on the `kernel-event` channel (e.g. a toast), in addition to any existing event logging.

#### Scenario: SetActiveAgent fails

- **WHEN** the UI receives an `Error` event after attempting to switch agents
- **THEN** the user SHALL see a visible error indication containing the event message (or a fallback if the message is missing)
