

'use strict';

const { Contract } = require('fabric-contract-api');

class GraphSmartContract extends Contract {



    /**
     * Initializes the ledger with a predefined set of vertices representing a hierarchical structure.
     * Each vertex contains information about its direct and effective children and parents, including permissions.
     * 
     * @param {Context} ctx - The transaction context provided by the Fabric runtime.
     * 
     * The ledger will be initialized with the following properties for each vertex:
     * - `vertex`: Identifier for the node.
     * - `direct_children_index_table`: Array of direct child vertices with their permissions.
     * - `effective_children_index_table`: Array of effective child vertices with permissions and intermediary nodes.
     * - `direct_parent_index_table`: Array of direct parent vertices.
     * - `effective_parent_index_table`: Array of effective parent vertices with intermediary nodes.
     */
    async initLedger(ctx) {
        console.info('============= START : Initialize Ledger ===========');
        const vertices = [
            {
                vertex: "G1",
                direct_children_index_table: [
                    { vertex: "U1", permissions: "101" }
                ],
                effective_children_index_table: [{ vertex: "U1", permissions: "101", intermediaries: ["U1"] }],
                direct_parent_index_table: ["A1"],
                effective_parent_index_table: [{ vertex: "A1", intermediaries: ["A1"] }],
            },
            {
                vertex: "U1",
                direct_children_index_table: [],
                effective_children_index_table: [],
                direct_parent_index_table: ["G1"],
                effective_parent_index_table: [{ vertex: "A1", intermediaries: ["G1"] },
                { vertex: "G1", intermediaries: ["G1"] }],
            },
            {
                vertex: "A1",
                direct_children_index_table: [
                    { vertex: "G1", permissions: "101" }
                ],
                effective_children_index_table: [{ vertex: "U1", permissions: "101", intermediaries: ["G1"] },
                { vertex: "G1", permissions: "101", intermediaries: ["G1"] }
                ],
                direct_parent_index_table: [],
                effective_parent_index_table: [],
            }
        ];

        for (let i = 0; i < vertices.length; i++) {
            vertices[i].docType = 'vertex';
            const compositeKey = ctx.stub.createCompositeKey('vertex', [vertices[i].vertex]);

            await ctx.stub.putState(compositeKey, Buffer.from(JSON.stringify(vertices[i])));
            console.info('Added <--> ', vertices[i]);
        }
        console.info('============= END : Initialize Ledger ===========');
    }

    /**
     * Queries the graph structure stored on the ledger and retrieves its data.
     * This function is used to fetch and display the hierarchical relationships 
     * between vertices, including their connections and attributes.
     * 
     * @param {Context} ctx - The transaction context provided by the Fabric runtime.
     * @returns {Promise<string>} - A JSON string representing the graph data stored in the ledger.
     * 
    **/
    async queryGraph(ctx) {
        const objectType = 'vertex';  // The composite key prefix
        const allResults = [];

        // Retrieve all records with the composite key prefix 'vertex'
        for await (const { key, value } of ctx.stub.getStateByPartialCompositeKey(objectType, [])) {
            const strValue = Buffer.from(value).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);

            } catch (err) {

                record = strValue;
            }
            allResults.push(record);
        }
        return JSON.stringify(allResults);
    }

    /**
     * Retrieves the effective permissions between a source vertex and a destination vertex in the graph.
     * This function analyzes the relationships and permissions in the graph to determine the effective 
     * permissions granted to the source for accessing the destination.
     * 
     * @param {Context} ctx - The transaction context provided by the Fabric runtime.
     * @param {string} source - The vertex identifier of the source node.
     * @param {string} destination - The vertex identifier of the destination node.
     * @returns {Promise<string>} - A JSON string representing the effective permissions between the source and destination.
     * 
     * The effective permissions are determined based on:
     * - Direct and effective child-parent relationships.
     * - Permissions defined in the graph structure.
     * - Intermediaries that mediate access between nodes.
     */
    async getEffectivePermission(ctx, source, destination) {
        console.info(`============= START : Get Effective Permission from ${source} to ${destination} ===========`);
        
        // Check if source exists
        const compositeKeySource = ctx.stub.createCompositeKey('vertex', [source]);
        const sourceDataAsBytes = await ctx.stub.getState(compositeKeySource);
        if (!sourceDataAsBytes || sourceDataAsBytes.length === 0) {
            throw new Error(`Source vertex ${source} does not exist`);
        }
        const sourceData = JSON.parse(sourceDataAsBytes.toString());

        // Fetch the destination vertex data
        const compositeKey = ctx.stub.createCompositeKey('vertex', [destination]);
        const destinationDataAsBytes = await ctx.stub.getState(compositeKey);
        if (!destinationDataAsBytes || destinationDataAsBytes.length === 0) {
            throw new Error(`Destination vertex ${destination} does not exist`);
        }
        const destinationData = JSON.parse(destinationDataAsBytes.toString());

        console.log(destinationData);

        const effectivePermissions = destinationData.effective_children_index_table.find(
            (child) =>  child.vertex == source 
        );
       // return effectivePermissions.permissions.toString();
        console.info(`Effective Permission: ${JSON.stringify(effectivePermissions.permissions)}`);
        console.info('============= END : Get Effective Permission ===========');
        return JSON.stringify(effectivePermissions.permissions);
            }   

    /**
     * Deletes the permissions between a source vertex and a destination vertex in the graph.
     * 
     * @param {Context} ctx - The transaction context provided by the Fabric runtime.
     * @param {string} sourceVertexId - The vertex identifier of the source node.
     * @param {string} destinationVertexId - The vertex identifier of the destination node.
     * 
     * The function deletes the permissions between the source and destination vertices, and then 
     * propagates the changes to the graph by calling topDownPropagation and bottomUpPropagation.
     * 
     * It also updates the direct and effective children and parent indices of the source and destination vertices.
     * 
     * @returns {Promise<void>}
     */
    async deletePermissions(ctx, sourceVertexId, destinationVertexId) {
        const operation = "DELETE";

        // Retrieve the source vertex data
        const sourceVertexKey = ctx.stub.createCompositeKey('vertex', [sourceVertexId]);
        const sourceVertex = await ctx.stub.getState(sourceVertexKey);

        if (!sourceVertex) {
            throw new Error(`${sourceVertexId} does not exist`);
        }

        // Retrieve the destination vertex data
        const destinationVertexKey = ctx.stub.createCompositeKey('vertex', [destinationVertexId]);
        const destinationVertex = await ctx.stub.getState(destinationVertexKey);

        if (!destinationVertex) {
            throw new Error(`${destinationVertexId} does not exist`);
        }

        // Parse the source and destination vertex data
        const sourceVertexJson = JSON.parse(sourceVertex.toString());
        const destinationVertexJson = JSON.parse(destinationVertex.toString());

        // Get the effective children and parent identifiers of the source and destination vertices
        const sourceChildrenIds = sourceVertexJson.effective_children_index_table
            .map(child => child.vertex)
            .concat([sourceVertexId]);

        const destinationParentIds = destinationVertexJson.effective_parent_index_table
            .map(child => child.vertex)
            .concat([destinationVertexId]);

        // Propagate the changes to the graph
        await this.topDownPropagation(ctx, sourceVertexJson, "TOP_DOWN", operation, destinationParentIds, destinationVertexJson);
        await this.topDownPropagation(ctx, destinationVertexJson, "BOTTOM_UP", operation, sourceChildrenIds, sourceVertexJson);

        // Update the direct and effective children and parent indices of the source and destination vertices
        sourceVertexJson.direct_parent_index_table = sourceVertexJson.direct_parent_index_table.filter(id => id != destinationVertexId);
        sourceVertexJson.effective_parent_index_table = sourceVertexJson.effective_parent_index_table.filter(child => child.vertex != destinationVertexId);

        destinationVertexJson.direct_children_index_table = destinationVertexJson.direct_children_index_table.filter(id => id.vertex != sourceVertexId);
        destinationVertexJson.effective_children_index_table = destinationVertexJson.effective_children_index_table.filter(child => child.vertex != sourceVertexId);

        // Update the source and destination vertex data
        await ctx.stub.putState(sourceVertexKey, Buffer.from(JSON.stringify(sourceVertexJson)));
        await ctx.stub.putState(destinationVertexKey, Buffer.from(JSON.stringify(destinationVertexJson)));
    }

    /**
     * Updates the permissions between a source vertex and a destination vertex in the graph.
     * 
     * @param {Context} ctx - The transaction context provided by the Fabric runtime.
     * @param {string} sourceVertexId - The vertex identifier of the source node.
     * @param {string} destinationVertexId - The vertex identifier of the destination node.
     * @param {string} permissions - The new permissions to be assigned between the source and destination vertices.
     * @param {string} operation - The operation type (e.g., "ADD", "UPDATE", "DELETE") used for propagation.
     * 
     * The function updates the permissions between the source and destination vertices, and then 
     * propagates the changes to the graph by calling topDownPropagation and bottomUpPropagation.
     * 
     * It also updates the direct and effective children and parent indices of the source and destination vertices.
     */
    async updatePermissions(ctx, sourceVertexId, destinationVertexId, permissions, operation) {
        if (!sourceVertexId || !destinationVertexId || !permissions || !operation) {
            throw new Error('Missing required parameters');
        }

        try {
            const sourceVertexKey = ctx.stub.createCompositeKey('vertex', [sourceVertexId]);
            const destinationVertexKey = ctx.stub.createCompositeKey('vertex', [destinationVertexId]);

            const sourceVertex = await ctx.stub.getState(sourceVertexKey);
            const destinationVertex = await ctx.stub.getState(destinationVertexKey);

            if (!sourceVertex || sourceVertex.length === 0) {
                throw new Error(`${sourceVertexId} does not exist`);
            }

            if (!destinationVertex || destinationVertex.length === 0) {
                throw new Error(`${destinationVertexId} does not exist`);
            }

            const sourceVertexJson = JSON.parse(sourceVertex.toString());
            const destinationVertexJson = JSON.parse(destinationVertex.toString());

          
            await this.updatePermissionsHelper(ctx, sourceVertexJson, destinationVertexJson, permissions, operation);

            console.log('Source Vertex Json '+ JSON.stringify(sourceVertexJson))
            console.log('Destination Vertex Json' + JSON.stringify(destinationVertexJson))
            await ctx.stub.putState(sourceVertexKey, Buffer.from(JSON.stringify(sourceVertexJson)));
            await ctx.stub.putState(destinationVertexKey, Buffer.from(JSON.stringify(destinationVertexJson)));

        } catch (err) {
            console.error('Error in updatePermissions:', err);
            throw new Error('Failed to update permissions');
        }
    }
    
    
/**
 * Updates the permissions between a source vertex and a destination vertex in the graph.
 * 
 * This function updates the index tables for both the source and destination vertices
 * with the specified permissions. If the vertices do not exist in the index tables, it
 * adds them with the given permissions. It then propagates the changes through the graph
 * using top-down and bottom-up propagation.
 * 
 * @param {Context} ctx - The transaction context provided by the Fabric runtime.
 * @param {Object} sourceVertexJson - The JSON representation of the source vertex.
 * @param {Object} destinationVertexJson - The JSON representation of the destination vertex.
 * @param {string} permissions - The permissions to be assigned between the vertices.
 * @param {string} operation - The operation type (e.g., "ADD", "UPDATE") used for propagation.
 * @param {Array} sourceChildrenIds - List of effective children identifiers of the source vertex.
 * @param {Array} destinationParentIds - List of effective parent identifiers of the destination vertex.
 * 
 * If the vertices are not present in the index tables, they are added with the given permissions.
 * The function then performs propagation to update the graph structure accordingly.
 * 
 * @throws Will throw an error if updating the index tables or propagating permissions fails.
 */
    async updatePermissionsHelper(ctx, sourceVertexJson, destinationVertexJson, permissions, operation) {
        let vertexExists_effective_parent = false;
        let vertexExists_direct_parent = false;
        let vertexExists_effective_children = false;
        let vertexExists_direct_children = false;
        try {
            vertexExists_effective_parent = this.updatePermissionsInParentIndexTable(sourceVertexJson.effective_parent_index_table, destinationVertexJson.vertex) || vertexExists_effective_parent;
            vertexExists_direct_parent = this.updatePermissionsInParentIndexTable(sourceVertexJson.direct_parent_index_table, destinationVertexJson.vertex) || vertexExists_direct_parent;
            vertexExists_effective_children = this.updatePermissionsInIndexTable(destinationVertexJson.effective_children_index_table, sourceVertexJson.vertex, permissions) || vertexExists_effective_children;
            vertexExists_direct_children = this.updatePermissionsInIndexTable(destinationVertexJson.direct_children_index_table, sourceVertexJson.vertex, permissions) || vertexExists_direct_children;
        } catch (err) {
            console.error('Error updating permissions in index tables:', err);
            throw new Error('Failed to update permissions in index tables');
        }

        if (!vertexExists_direct_children) {
             destinationVertexJson.direct_children_index_table.push({ permissions, vertex: sourceVertexJson.vertex });
         }
        if (!vertexExists_direct_parent) {
             sourceVertexJson.direct_parent_index_table.push(destinationVertexJson.vertex);
        }
        // if(!vertexExists_effective_parent){
        //     sourceVertexJson.effective_parent_index_table.push({vertex:  destinationVertexJson.vertex, intermediaries: [destinationVertexJson.vertex] });
        // }
       
        // if(!vertexExists_effective_children)
        // {
        //     destinationVertexJson.effective_children_index_table.push({ permissions, vertex: sourceVertexJson.vertex  , intermediaries: [sourceVertexJson.vertex]});
  
        // }
            try {
            const sourceChildrenIds = sourceVertexJson.effective_children_index_table
            .map(child => child.vertex)
            .concat([sourceVertexJson.vertex]);

            const destinationParentIds = destinationVertexJson.effective_parent_index_table
            .map(child => child.vertex)
            .concat([destinationVertexJson.vertex]);
          
            console.log("Destination p: ", destinationParentIds)
            console.log("Source ch: ", sourceChildrenIds)
            await this.topDownPropagation(ctx, sourceVertexJson, "TOP_DOWN", operation,destinationParentIds, destinationVertexJson );
            await this.topDownPropagation(ctx, destinationVertexJson, "BOTTOM_UP", operation,sourceChildrenIds , sourceVertexJson );
        } catch (err) {
            console.error('Error propagating permissions:', err);
            throw new Error('Failed to propagate permissions');
        }

       
    }

    /**
     * Updates the permissions for a specified vertex in the given index table.
     *
     * @param {Array} indexTable - The index table containing vertex records.
     * @param {string} vertexId - The identifier of the vertex whose permissions need to be updated.
     * @param {string} permissions - The new permissions to be assigned to the vertex.
     * @returns {boolean} - Returns true if the vertex exists in the index table and was updated; otherwise, false.
    */
    updatePermissionsInIndexTable(indexTable, vertexId, permissions) {
        let vertexExists = false;
        for (const element of indexTable) {
            if (element.vertex == vertexId) {
                element.permissions = permissions;
                vertexExists = true;
                break;
            }
        }
        return vertexExists;
    }

    updatePermissionsInParentIndexTable(indexTable, vertexId) {
        //console.log('TEST updatePermissionsInParentIndexTable')
        let vertexExists = false;
        for (const element of indexTable) {
            if (element.vertex == vertexId) {
                
                vertexExists = true;
                break;
            }
        }
        return vertexExists;
    }

    /**
     * Performs a top-down propagation from a given vertex to its children and parents.
     * 
     * @param {Context} ctx - The transaction context provided by the Fabric runtime.
     * @param {Object} vertex - The JSON representation of the vertex.
     * @param {string} direction - The propagation direction (e.g., "TOP_DOWN", "BOTTOM_UP").
     * @param {string} operation - The operation type (e.g., "ADD", "UPDATE", "DELETE") used for propagation.
     * @param {Array} effectiveNeighbors - List of effective neighbors of the vertex.
     * @param {Object} intermediary - The JSON representation of the intermediary vertex.
     * 
     * The function updates the effective children and parent indices of the vertex and its neighbors,
     * and then propagates the changes to the graph by recursively calling itself on the neighbors.
     * 
     */
    async topDownPropagation(ctx, vertex, direction, operation, effectiveNeighbors, intermediary) {
        //console.log("===================================================================================================")
       // console.log(`Starting propagation for vertex: ${vertex.vertex}, dir: ${direction}, op: ${operation}, int: ${intermediary.vertex}`);
        
        const compositeKey = ctx.stub.createCompositeKey('vertex', [vertex.vertex]);
        let toPropagate = [];
        let omega = [];
        let successors = null;
        let record;
        
        if (direction === "TOP_DOWN") {
            omega = vertex.effective_parent_index_table || [];
            successors = vertex.direct_children_index_table || []; 
            record = { "intermediaries": [], "vertex": false };
        } else {
            omega = vertex.effective_children_index_table || [];
            successors = vertex.direct_parent_index_table || [];
            record = { "intermediaries": [], "permissions": "000", "vertex": false };
        }

        //console.log(`Initial omega: ${JSON.stringify(omega)}`);
        //console.log(`Initial successors: ${JSON.stringify(successors)}`);
        //console.log(`Effective neighbors: ${JSON.stringify(effectiveNeighbors)}`);
        //console.log(`Intermediary: ${JSON.stringify(intermediary)}`);
        let gamma = record;
        effectiveNeighbors.forEach(e => {
           //console.log("E: ", e);
            try {

            gamma = omega.find(x => x.vertex == e) || { ...record, intermediaries: [] };
            
            let recalculatePrivileges = false;
            if (operation === "ADD") {
                let add = false;
                if (!gamma.vertex) {
                    toPropagate.push(e); 
                    gamma.vertex = e;
                    add = true;
                }
                if (!gamma.intermediaries.includes(intermediary.vertex)) {
                    gamma.intermediaries.push(intermediary.vertex); 
                    recalculatePrivileges = true;
                }
                
                if (add) {
         //           console.log(`Adding ${gamma.vertex} to omega`);
                    omega.push(gamma);
                }
              
            } else if (operation === "DELETE") {
                if (!gamma.vertex || !gamma.intermediaries.includes(intermediary.vertex)) return;

                gamma.intermediaries = gamma.intermediaries.filter(i => i !== intermediary.vertex);
                if (gamma.intermediaries.length === 0) {
                    omega = omega.filter(x => x.vertex !== gamma.vertex);
                    toPropagate.push(e);
                } else {
                    recalculatePrivileges = true;
                }
            } else if (operation === "UPDATE") {
                recalculatePrivileges = true;
            }

            if (direction === "BOTTOM_UP" && recalculatePrivileges) {
                 gamma.permissions = gamma.intermediaries.reduce((permissions, intermediary) => {
                    const neighbor = vertex.direct_children_index_table.find(neigh => neigh.vertex == intermediary);
                    if (neighbor) {
             //           console.log("Calculate permissions: ", permissions , " - ", neighbor.permissions)
                        return (parseInt(permissions, 2) | parseInt(neighbor.permissions, 2)).toString(2).padStart(3, "0");
                    }
                    return permissions;
                }, "000");
                //console.log(`Calculated permissions: ${JSON.stringify(gamma)}`);
            }
            
        } catch (error) {
            console.error(`Error for neighbor ${e}:`, error);
        }
     
        });

        //console.log(`To propagate: ${JSON.stringify(toPropagate)}`);
        //console.log("successors: ", successors);
        if (toPropagate.length > 0) {
            if (vertex) {
                intermediary = vertex; 
            }
            effectiveNeighbors = toPropagate;
            for (const s of successors) {
               // console.log(`Propagating to successor: ${s.vertex}`);
                const compositeKeySuccessor = ctx.stub.createCompositeKey('vertex', [s.vertex || s]);
                const successor_vertex = await ctx.stub.getState(compositeKeySuccessor);
                
                if (!successor_vertex || successor_vertex.length === 0) {
                    throw new Error('No data found');
                } else {
                    await this.topDownPropagation(ctx, JSON.parse(successor_vertex.toString()), direction, operation, effectiveNeighbors, vertex);
                }
            }
        }

        if (direction === "TOP_DOWN") {
            vertex.effective_parent_index_table = omega || [];
            vertex.direct_children_index_table = successors || [];
        } else {
            vertex.effective_children_index_table = omega || [];
            vertex.direct_parent_index_table = successors || [];
        }
        //console.log(`Updated vertex effective_children_index_table: ${JSON.stringify(vertex.effective_children_index_table)}`);
        //console.log("Composite key: ", compositeKey);
       // console.log("vertex: ", vertex);
        try{
            await ctx.stub.putState(compositeKey, Buffer.from(JSON.stringify(vertex)));
        } catch (error) {
            console.error(`Error while saved vertex ${vertex.vertex}:`, error);
        }

        //console.log(`Propagation end for vertex: ${vertex.vertex}, direction: ${direction}`);
    }

    /**
     * Adds a new vertex to the graph.
     * 
     * @param {Context} ctx - The transaction context provided by the Fabric runtime.
     * @param {string} vertex - The identifier of the vertex to be added.
     * 
     * The function creates a new vertex with the given identifier and initializes its
     * direct and effective children and parents index tables. If the vertex already exists,
     * the function throws an error.
     */
    async addVertex(ctx, vertex) {

        const compositeKey = ctx.stub.createCompositeKey('vertex', [vertex]);

        const existingVertexBuffer = await ctx.stub.getState(compositeKey);
        if (existingVertexBuffer && existingVertexBuffer.length > 0) {
            throw new Error(`Vertex ${vertex} already exists.`);
        }

        const newVertex = {
            vertex: vertex,
            direct_children_index_table: [],
            effective_children_index_table:  [],
            direct_parent_index_table: [],
            effective_parent_index_table:  []
        };

        const newVertexBuffer = Buffer.from(JSON.stringify(newVertex));
    
        await ctx.stub.putState(compositeKey, newVertexBuffer);
        console.log(`Vertex ${vertex} added successfully.`);
    }
    
    /**
     * Deletes all records from the ledger.
     * 
     * This function is typically used for testing purposes, such as clearing the ledger before running a series of tests.
     * 
     * @param {Context} ctx - The transaction context provided by the Fabric runtime.
     */
    
    async deleteAllFromState(ctx) {
        const objectType = 'vertex';  

        for await (const { key, value } of ctx.stub.getStateByPartialCompositeKey(objectType, [])) {
            if (value) {
                console.log(`Deleting key: ${key}`);
                await ctx.stub.deleteState(key);
            }
    
        }
        console.log('All records have been deleted.');
    }

}

module.exports = GraphSmartContract;
