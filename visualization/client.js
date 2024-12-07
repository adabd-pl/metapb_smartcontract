const fs = require('fs');
const GraphSmartContract = require('../lib/graphsmartcontract');
const sinon = require('sinon');

function loadJSON(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}


function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function simulateGraphOperations(inputFilePath, outputFilePath) {
  const  ctx = {
    stub: {
      createCompositeKey: sinon.stub(),
      getState: sinon.stub(),
      putState: sinon.stub()
    }
  };



  const graphSmartContract = new GraphSmartContract();
  const initialGraph = loadJSON(inputFilePath);
  const state = {}; 
  state.graph = initialGraph;

  ctx.stub.createCompositeKey = sinon.stub().callsFake((objectType, attributes) => {
    return `${objectType}:${attributes.join(':')}`;
  });
  

  ctx.stub.getState = sinon.stub().callsFake(async (key) => {
    const foundItem = state.graph.find(item => ('vertex:' + item.vertex) == key);
  
    return foundItem ? Buffer.from(JSON.stringify(foundItem)) : null;
  });
  

  ctx.stub.putState = sinon.stub().callsFake(async (key, value) => {
    console.log(`Saving key: ${key}, value: ${value.toString()}`);
    if (!Array.isArray(state.graph)) {
      state.graph = [];
    }
    
    const parsedValue = JSON.parse(value.toString());
    console.log(parsedValue)
    let existing = state.graph.find(item => item.vertex == parsedValue.vertex);
    if (existing) {
      Object.assign(existing, parsedValue); 
    } else {
      state.graph.push(parsedValue);
    }
  });
  
  // Add vertices
  await graphSmartContract.addVertex(ctx, "U1" ); 
  await graphSmartContract.addVertex(ctx, "G1" ); 
  await graphSmartContract.addVertex(ctx, "G2" ); 
  await graphSmartContract.addVertex(ctx, "A1" ); 
  await graphSmartContract.addVertex(ctx, "A2" ); 
  await graphSmartContract.addVertex(ctx, "G3" );

  console.log("Actual graph state: ",state.graph);

   // Add Edges
  // await graphSmartContract.updatePermissions(ctx, "U1" ,  "G1" , "101" ,"ADD"); 
  // await graphSmartContract.updatePermissions(ctx, "U1" ,  "A1" , "101" ,"ADD");
  // await graphSmartContract.updatePermissions(ctx, "G1" ,  "A1" , "010" ,"ADD"); 
  // await graphSmartContract.updatePermissions(ctx, "G1" ,  "G2" , "110" ,"ADD");
  // await graphSmartContract.updatePermissions(ctx, "G2" ,  "A2" , "011" ,"ADD"); 
  // await graphSmartContract.updatePermissions(ctx, "G2" ,  "A3" , "001" ,"ADD"); 

  let operation = "ADD";
  await graphSmartContract.updatePermissions(ctx, 'U1', 'G1', '010', operation);
  await graphSmartContract.updatePermissions(ctx, 'G1', 'A1', '101', operation);
  await graphSmartContract.updatePermissions(ctx, 'G2', 'A1', '001', operation);
  await graphSmartContract.updatePermissions(ctx, 'G3', 'A2', '101', operation);
  await graphSmartContract.updatePermissions(ctx, 'G2', 'G3', '011', operation);
  await graphSmartContract.updatePermissions(ctx, 'U1', 'A1', '100', operation);

  const finalGraph = state.graph;
  saveJSON(outputFilePath, finalGraph);

  console.log(`Graph saved to: ${outputFilePath}`);
}

simulateGraphOperations('graphData.json', 'outputGraph.json')
  .catch(err => console.error('Error:', err));
