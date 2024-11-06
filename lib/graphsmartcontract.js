

'use strict';

const { Contract } = require('fabric-contract-api');

class GraphSmartContract extends Contract {



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

    async getEffectivePermission(ctx, source, destination) {

        const compositeKey = ctx.stub.createCompositeKey('vertex', [destination]);
        const destination_vertex = await ctx.stub.getState(compositeKey);
        if (!destination_vertex || source === 0) {
            throw new Error(`${destination} does not exist`);
        }
        console.log(destination_vertex.toString());
        const destination_vertex_json = JSON.parse(destination_vertex.toString());

        for (const element of destination_vertex_json.effective_children_index_table) {
            console.log(element.vertex + " - " + source);
            if (element.vertex === source) {
                return element.permissions.toString();
            }
        }
        for (const element of destination_vertex_json.direct_children_index_table) {
            console.log(element.vertex + " - " + source);
            if (element.vertex === source) {
                return element.permissions.toString();
            }
        }
        throw new Error(`Path does not exist`);
    }


    /*Deleting edge/permissions in graph from source and destination*/
    async deletePermissions(ctx, source, destination) {
        let operation = "DELETE"
        const compositeKey = ctx.stub.createCompositeKey('vertex', [destination]);
        let destination_vertex = await ctx.stub.getState(compositeKey);
        const compositeKey_source = ctx.stub.createCompositeKey('vertex', [source]);
        let source_vertex = await ctx.stub.getState(compositeKey_source);

        if (!destination_vertex || destination === 0) {
            throw new Error(`${destination} does not exist`);
        }
        if (!source_vertex || source === 0) {
            throw new Error(`${source} does not exist`);
        }
        console.info('============= START : delete Permission for ' + destination_vertex + ' ===========');

        const destination_vertex_json = JSON.parse(destination_vertex.toString());
        const source_vertex_json = JSON.parse(source_vertex.toString());


        const sourceChildrenIDs = source_vertex_json.effective_children_index_table.map(child => child.vertex);
        sourceChildrenIDs.push(source);
        console.log("Total intermediary IDs:", sourceChildrenIDs + " via " + destination);

  
        const destinationParentIDs = destination_vertex_json.effective_parent_index_table.map(child => child.vertex);
        destinationParentIDs.push(destination);
        console.log("Total intermediary IDs:", destinationParentIDs + " via " + source);
        
        /*Propagate 'events' TOP_DOWN and BOTTOM_UP*/
        await this.topDownPropagation(ctx, source_vertex_json, "TOP_DOWN", operation,destinationParentIDs , destination_vertex_json)
        await this.topDownPropagation(ctx, destination_vertex_json, "BOTTOM_UP", operation,sourceChildrenIDs , source_vertex_json)

     
        source_vertex_json.direct_parent_index_table = source_vertex_json.direct_parent_index_table.filter(x => x != destination);
        source_vertex_json.effective_parent_index_table = source_vertex_json.effective_parent_index_table.filter(x => x.vertex != destination);

        destination_vertex_json.direct_children_index_table = destination_vertex_json.direct_children_index_table.filter(x => x.vertex != source);
        destination_vertex_json.effective_children_index_table = destination_vertex_json.effective_children_index_table.filter(x => x.vertex != source);

        /*Update indexes table at ends of edge*/
        await ctx.stub.putState(compositeKey, Buffer.from(JSON.stringify(destination_vertex_json)));
        await ctx.stub.putState(compositeKey_source, Buffer.from(JSON.stringify(source_vertex_json)));
    }

    async updatePermissions(ctx, source, destination, permissions, operation) {

        const compositeKey = ctx.stub.createCompositeKey('vertex', [destination]);
        let destination_vertex = await ctx.stub.getState(compositeKey);
     
        const compositeKey_source = ctx.stub.createCompositeKey('vertex', [source]);
        let source_vertex = await ctx.stub.getState(compositeKey_source);

        if (!destination_vertex || destination === 0) {
            throw new Error(`${destination} does not exist`);
        }
        if (!source_vertex || source === 0) {
            throw new Error(`${source} does not exist`);
        }
    
        const destination_vertex_json = JSON.parse(destination_vertex.toString());
        const source_vertex_json = JSON.parse(source_vertex.toString());
        console.info('============= START : update Permission for ' +source_vertex_json.vertex+'-'  +  destination_vertex_json.vertex  +  ' ===========');

        let vertexExists = false;
        /*update directed permissions if edge exists*/
        for (const element of destination_vertex_json.direct_children_index_table) {
            if (element.vertex === source) {
                element.permissions = permissions;
                vertexExists = true;
                break;
            }
        }
        for (const element of destination_vertex_json.effective_children_index_table) {
            if (element.vertex === source) {
                element.permissions = permissions;
                vertexExists = true;
                break;
            }
        }
        for (const element of source_vertex_json.direct_parent_index_table) {
            if (element.vertex === source) {
                element.permissions = permissions;
                vertexExists = true;
                break;
            }
        }
        for (const element of source_vertex_json.effective_parent_index_table) {
            if (element.vertex === source) {
                element.permissions = permissions;
                vertexExists = true;
                break;
            }
        }

       const sourceChildrenIDs = source_vertex_json.effective_children_index_table.map(child => child.vertex);
       sourceChildrenIDs.push(source);
       console.log("Total intermediary IDs:", sourceChildrenIDs + " via " + destination);
        
       const destinationParentIDs = destination_vertex_json.effective_parent_index_table.map(child => child.vertex);
       destinationParentIDs.push(destination);
       console.log("Total intermediary IDs:", destinationParentIDs + " via " + source);
      
      if (!vertexExists) {
            destination_vertex_json.direct_children_index_table.push( {"permissions": permissions, "vertex": source } );
        //     destination_vertex_json.effective_children_index_table.push( {"permissions": permissions, "vertex": source , "intermediaries": [
        //         source
        // ], } );
            source_vertex_json.direct_parent_index_table.push(  destination  );
        //     source_vertex_json.effective_parent_index_table.push( { "vertex": destination , "intermediaries": [
        //         destination
        // ], } );
        }

       console.log("DEBUG destination_vertex_json.omega " , destination_vertex_json.effective_children_index_table)
        await this.topDownPropagation(ctx, source_vertex_json, "TOP_DOWN", operation, destinationParentIDs, destination_vertex_json)
        await this.topDownPropagation(ctx, destination_vertex_json, "BOTTOM_UP", operation, sourceChildrenIDs, source_vertex_json)

        await ctx.stub.putState(compositeKey, Buffer.from(JSON.stringify(destination_vertex_json)));
        await ctx.stub.putState(compositeKey_source, Buffer.from(JSON.stringify(source_vertex_json)));
       
    }

    async topDownPropagation(ctx, vertex, direction, operation, effectiveNeighbors, intermediary) {
        const compositeKey = ctx.stub.createCompositeKey('vertex', [vertex.vertex]);
        let toPropagate = [];
        let omega = [];
        let successors = null;
        let record;
        if (direction === "TOP_DOWN") {
            omega = vertex.effective_parent_index_table || [];
            successors = vertex.direct_children_index_table || [];
            record = {
                "intermediaries": [],
                "vertex": false
              }
        } else {
            omega = vertex.effective_children_index_table || [];
            successors = vertex.direct_parent_index_table || [];
            record = {
                "intermediaries": [],
                "permissions": "000",
                "vertex": false
              }
        }
        
        console.log("=============================================")
        console.log(direction + "PROPAGATION START FOR " + vertex.vertex);
        console.log("omega: ", omega);
        console.log("successors: ", successors);
        console.log("effectiveNeighbors: " , effectiveNeighbors);
        
        effectiveNeighbors.forEach(e => {
            let gamma = omega.find(x => x.vertex === e) || record;
            let recalculatePrivileges = false;
       
            if (operation === "ADD") {
                let add= false;
                
                if (!gamma.vertex) {
                    toPropagate.push(e); 
                    gamma.vertex = e;
                    add= true;
                }
                if (!gamma.intermediaries.includes(intermediary.vertex)) {
                    gamma.intermediaries.push(intermediary.vertex); 
                    recalculatePrivileges = true;       
                }        
                if(add == true){
                    console.log( " ADD "  + gamma.vertex + " TO OMEGA" )
                    omega.push(gamma);
                    console.log("CALCULATED OMEGA " , omega)
                }
              
            } else if (operation === "DELETE") {
                console.log("gamma ", gamma)
                console.log("")
                console.log(!gamma.vertex || !gamma.intermediaries.includes(intermediary.vertex))
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
                console.log("========================================================================")
                console.log("calculate permissions for " + gamma.vertex + "intermediaries: " + gamma.intermediaries)
                gamma.permissions = gamma.intermediaries.reduce((permissions, intermediary) => {

                    console.log(vertex)
                    const neighbor = vertex.direct_children_index_table.find(neigh => neigh.vertex === intermediary);
                    if (neighbor) {
                        return (parseInt(permissions, 2) | parseInt(neighbor.permissions, 2)).toString(2).padStart(3, "0");
                    }
                    return permissions;
                }, "000");
                console.log("Calculated permissions: " + gamma)
                console.log("========================================================================")
            }

           
        });
        console.log("Table for propagate: " + toPropagate);
        if (toPropagate.length > 0) {
            if (vertex) {
                intermediary = vertex; 
            }
            effectiveNeighbors = toPropagate;
             for (const s of successors) {
                const compositeKeySuccessor = ctx.stub.createCompositeKey('vertex', [s]);
                const successor_vertex = await ctx.stub.getState(compositeKeySuccessor);
                console.log("Propagate to ", JSON.parse(successor_vertex.toString()));
               
                if (!successor_vertex || successor_vertex.length === 0) {
                    throw new Error('No data found');
                }
                else{
                    await this.topDownPropagation(ctx, JSON.parse(successor_vertex.toString()), direction, operation, effectiveNeighbors, intermediary);
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
        console.log("vertex.effective_children_index_table " , vertex.effective_children_index_table)
        
        await ctx.stub.putState(compositeKey, Buffer.from(JSON.stringify(vertex)));
        console.log(direction + "PROPAGATION END FOR " + vertex.vertex);
        console.log("=============================================")
    }

    
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

    
    async deleteAllFromState(ctx) {
        const objectType = 'vertex';  
        
        for await (const { key, value } of ctx.stub.getStateByPartialCompositeKey(objectType, [])) {
            const strValue = Buffer.from(value).toString('utf8');
         
            if (value) {
                console.log(`Deleting key: ${key}`);
                await ctx.stub.deleteState(key);
            }
        }
        console.log('All records have been deleted.');
    }
    



}

module.exports = GraphSmartContract;
