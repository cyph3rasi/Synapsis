/**
 * Swarm Module
 * 
 * The Synapsis swarm is a decentralized network of nodes that discover
 * and communicate with each other using a hybrid approach:
 * 
 * 1. Seed nodes (like node.synapsis.social) provide initial bootstrap
 * 2. Gossip protocol spreads node/handle information epidemically
 * 3. Any node can discover the full network without central authority
 * 
 * Usage:
 * - On node startup: call announceToSeeds() to register with the network
 * - Periodically: call runGossipRound() to exchange info with peers
 * - On demand: call discoverNode() to add a specific node
 */

export * from './types';
export * from './registry';
export * from './discovery';
export * from './gossip';
