# metapb_smartcontract

A **Hyperledger Fabric** smart contract implementing graph-based permission management (Meta Policy-Based Access Control). Chaincode written in **JavaScript** (Node.js).

---

## Description

The contract stores a directed graph structure on the Fabric ledger, where vertices represent entities (users, groups, attributes) and edges represent permission relationships. Permissions are automatically propagated up and down the graph hierarchy.

Each vertex stores:
- `direct_children_index_table` – direct children with their permissions
- `effective_children_index_table` – effective children (including intermediaries)
- `direct_parent_index_table` – direct parents
- `effective_parent_index_table` – effective parents (including intermediaries)

---

## Chaincode Methods

| Method | Type | Description |
|---|---|---|
| `initLedger` | invoke | Initializes the ledger with a sample structure (A1 → G1 → U1) |
| `addVertex` | invoke | Adds a new vertex to the graph |
| `updatePermissions` | invoke | Adds or updates permissions between vertices (ADD/UPDATE) |
| `deletePermissions` | invoke | Removes permissions between vertices |
| `getEffectivePermission` | query | Returns effective permissions between source and destination |
| `queryGraph` | query | Returns the full graph structure from the ledger |
| `deleteAllFromState` | invoke | Deletes all data from the ledger (test utility) |

---

## Permission Model

Permissions are represented as **3-bit binary strings** (e.g. `"101"`).  
Effective permissions are calculated as the **bitwise OR** of permissions across all intermediaries.

```
A1 --[101]--> G1 --[101]-->
```

---

## Installation & Usage

```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Start the chaincode
npm start
```


