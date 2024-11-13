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
    // Zakładamy, że objectType jest nazwą obiektu (np. 'vertex'), a attributes to tablica atrybutów.
    // Złączamy 'objectType' i 'attributes' (np. destinationVertexId) w jeden klucz złożony.
    return `${objectType}:${attributes.join(':')}`;
  });
  

  ctx.stub.getState = sinon.stub().callsFake(async (key) => {
    // Znajdź obiekt w state.graph na podstawie klucza 'key' (np. vertex).
    const foundItem = state.graph.find(item => ('vertex:' + item.vertex) == key);
  
    // Jeśli obiekt został znaleziony, zwróć go w postaci Buffer, w przeciwnym razie zwróć null.
    return foundItem ? Buffer.from(JSON.stringify(foundItem)) : null;
  });
  

  ctx.stub.putState = sinon.stub().callsFake(async (key, value) => {
    // Jeśli 'state.graph' nie jest tablicą, to inicjujemy ją jako pustą tablicę.
    if (!Array.isArray(state.graph)) {
      state.graph = [];
    }
    
    // Tworzymy nowy obiekt na podstawie wartości (parsowanie JSON) i dodajemy do tablicy.
    const parsedValue = JSON.parse(value.toString());
  
    // Jeśli klucz nie istnieje, dodajemy nowy obiekt, jeśli istnieje - nadpisujemy.
    let existing = state.graph.find(item => item.vertex === parsedValue.vertex);
    if (existing) {
      Object.assign(existing, parsedValue); // Nadpisujemy istniejący obiekt, jeżeli jest
    } else {
      state.graph.push(parsedValue); // Dodajemy nowy obiekt do tablicy
    }
  });
  
  // Add vertices
  await graphSmartContract.addVertex(ctx, "U1" ); 
  await graphSmartContract.addVertex(ctx, "G1" ); 
  await graphSmartContract.addVertex(ctx, "G2" ); 
  await graphSmartContract.addVertex(ctx, "A1" ); 
  await graphSmartContract.addVertex(ctx, "A2" ); 
  await graphSmartContract.addVertex(ctx, "A3" );

  console.log("Actual graph state: ",state.graph);

   // Add Edges
  await graphSmartContract.updatePermissions(ctx, "U1" ,  "G1" , "101" ,"ADD"); 
  await graphSmartContract.updatePermissions(ctx, "U1" ,  "A1" , "101" ,"ADD");
  await graphSmartContract.updatePermissions(ctx, "G1" ,  "A1" , "010" ,"ADD"); 
  await graphSmartContract.updatePermissions(ctx, "G1" ,  "G2" , "110" ,"ADD");
  await graphSmartContract.updatePermissions(ctx, "G2" ,  "A2" , "011" ,"ADD"); 
  await graphSmartContract.updatePermissions(ctx, "G2" ,  "A3" , "001" ,"ADD"); 

  const finalGraph = state.graph;
  saveJSON(outputFilePath, finalGraph);

  console.log(`Graph saved to: ${outputFilePath}`);
}

simulateGraphOperations('graphData.json', 'outputGraph.json')
  .catch(err => console.error('Error:', err));
