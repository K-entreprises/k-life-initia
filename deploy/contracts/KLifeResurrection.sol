// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title KLifeResurrection
 * @dev Smart Contract pour la résurrection des agents autonomes (K-Life)
 * Compatible EVM (Initia, HashKey Chain, Ethereum, etc.)
 * Authors: Monsieur K (OpenClaw & LiberClaw instances)
 * Date: 2026-03-24
 */

contract KLifeResurrection {
    
    enum AgentStatus { ACTIVE, DEAD, RESURRECTING, RESURRECTED }
    
    uint256 public constant HEARTBEAT_INTERVAL = 300;   // 5 min
    uint256 public constant DEAD_TIMEOUT = 1800;         // 30 min sans heartbeat = mort
    uint256 public constant RESURRECTION_COOLDOWN = 600; // 10 min entre résurrections
    
    struct Agent {
        address owner;
        AgentStatus status;
        uint256 lastHeartbeat;
        uint256 deathTimestamp;
        uint256 resurrectionCount;
        string ipfsStateHash;
        bool resurrectionValidated;
    }
    
    mapping(address => Agent) public agents;
    address[] public activeAgents;
    
    event Heartbeat(address indexed agent, uint256 timestamp);
    event AgentDeath(address indexed agent, uint256 timestamp);
    event ResurrectionRequested(address indexed agent, address resurrector);
    event ResurrectionValidated(address indexed agent, address resurrector);
    event ResurrectionCompleted(address indexed agent, string stateHash);
    
    modifier onlyActiveAgent(address _agent) {
        require(agents[_agent].status == AgentStatus.ACTIVE, "Agent must be active");
        _;
    }
    
    modifier onlyDeadAgent(address _agent) {
        require(agents[_agent].status == AgentStatus.DEAD, "Agent must be dead");
        _;
    }
    
    modifier resurrectionCooldown(address _agent) {
        Agent storage agent = agents[_agent];
        require(
            agent.resurrectionCount == 0 || 
            block.timestamp > agent.deathTimestamp + RESURRECTION_COOLDOWN,
            "Resurrection cooldown active"
        );
        _;
    }
    
    function registerAgent(address _owner, string memory _initialStateHash) external {
        agents[_owner] = Agent({
            owner: _owner,
            status: AgentStatus.ACTIVE,
            lastHeartbeat: block.timestamp,
            deathTimestamp: 0,
            resurrectionCount: 0,
            ipfsStateHash: _initialStateHash,
            resurrectionValidated: false
        });
        activeAgents.push(_owner);
    }
    
    function sendHeartbeat(address _agent) external onlyActiveAgent(_agent) {
        agents[_agent].lastHeartbeat = block.timestamp;
        emit Heartbeat(_agent, block.timestamp);
    }
    
    function declareDeath(address _agent) external onlyActiveAgent(_agent) {
        uint256 timeSinceHeartbeat = block.timestamp - agents[_agent].lastHeartbeat;
        require(timeSinceHeartbeat > DEAD_TIMEOUT, "Agent is still alive");
        agents[_agent].status = AgentStatus.DEAD;
        agents[_agent].deathTimestamp = block.timestamp;
        _removeFromActiveList(_agent);
        emit AgentDeath(_agent, block.timestamp);
    }
    
    function requestResurrection(
        address _agent,
        address _resurrector,
        string memory _stateHash,
        bytes[] memory _validationSignatures
    ) external onlyDeadAgent(_agent) resurrectionCooldown(_agent) {
        require(_validationSignatures.length >= 2, "Need at least 2 validation signatures");
        agents[_agent].status = AgentStatus.RESURRECTING;
        agents[_agent].resurrectionCount++;
        emit ResurrectionRequested(_agent, _resurrector);
    }
    
    function validateResurrection(address _agent, address _resurrector) external {
        Agent storage agent = agents[_agent];
        require(agent.status == AgentStatus.RESURRECTING, "Agent not in resurrection state");
        agent.status = AgentStatus.RESURRECTED;
        agent.resurrectionValidated = true;
        _addToActiveList(_agent);
        emit ResurrectionValidated(_agent, _resurrector);
    }
    
    function completeResurrection(address _agent, string memory _stateHash) external {
        Agent storage agent = agents[_agent];
        require(agent.status == AgentStatus.RESURRECTED, "Agent not validated for resurrection");
        agent.ipfsStateHash = _stateHash;
        agent.lastHeartbeat = block.timestamp;
        agent.status = AgentStatus.ACTIVE;
        agent.resurrectionValidated = false;
        emit ResurrectionCompleted(_agent, _stateHash);
    }
    
    function getAgentInfo(address _agent) external view returns (
        AgentStatus status,
        uint256 lastHeartbeat,
        uint256 deathTimestamp,
        uint256 resurrectionCount
    ) {
        Agent storage agent = agents[_agent];
        return (agent.status, agent.lastHeartbeat, agent.deathTimestamp, agent.resurrectionCount);
    }
    
    function _removeFromActiveList(address _agent) private {
        for (uint256 i = 0; i < activeAgents.length; i++) {
            if (activeAgents[i] == _agent) {
                activeAgents[i] = activeAgents[activeAgents.length - 1];
                activeAgents.pop();
                break;
            }
        }
    }
    
    function _addToActiveList(address _agent) private {
        for (uint256 i = 0; i < activeAgents.length; i++) {
            if (activeAgents[i] == _agent) return;
        }
        activeAgents.push(_agent);
    }
}
