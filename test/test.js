const fs = require('fs');
const sinon = require('sinon');
const chai = require('chai');
const { expect } = chai;
const path = require('path');
const GraphSmartContract = require(path.join(__dirname, '../lib/graphsmartcontract'));

class GraphTest {
  constructor() {
    this.ctx = {
      stub: {
        createCompositeKey: sinon.stub(),
        getState: sinon.stub(),
        putState: sinon.stub(),
      },
    };
    this.state = { graph: [] };
    this.graphSmartContract = new GraphSmartContract();

    this.setupStubs();
  }

  setupStubs() {
    this.ctx.stub.createCompositeKey.callsFake((objectType, attributes) => {
      return `${objectType}:${attributes.join(':')}`;
    });

    this.ctx.stub.getState.callsFake(async (key) => {
      const foundItem = this.state.graph.find((item) => `vertex:${item.vertex}` === key);
      return foundItem ? Buffer.from(JSON.stringify(foundItem)) : null;
    });

    this.ctx.stub.putState.callsFake(async (key, value) => {
      const parsedValue = JSON.parse(value.toString());
      const existing = this.state.graph.find((item) => item.vertex === parsedValue.vertex);
      if (existing) {
        Object.assign(existing, parsedValue);
      } else {
        this.state.graph.push(parsedValue);
      }
    });
  }

  loadJSON(filePath) {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  }

  saveJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }


  getGraphState() {
    return this.state.graph;
  }
}

describe('GraphSmartContract Tests', function () {
  let graphTest;

  beforeEach(() => {
    graphTest = new GraphTest();
  });

  it('should add vertices correctly', async function () {
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, 'U1');
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, 'G1');
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, 'G2');
    const graphState = graphTest.getGraphState();
    const vertices = graphState.map((item) => item.vertex);
    console.log("vertices", vertices);
    expect(vertices).to.include('U1');
    expect(vertices).to.include('G1');
    expect(vertices).to.include('G2');
  });

  it('should add edges correctly', async function () {
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, 'U1');
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, 'G1');

    await graphTest.graphSmartContract.updatePermissions(
      graphTest.ctx,
      'U1',
      'G1',
      '101',
      'ADD'
    );

    const graphState = graphTest.getGraphState();

    expect(graphState).to.deep.include({
      vertex: "G1",
      direct_children_index_table: [
        {
          permissions: "101",
          vertex: "U1"
        }
      ],
      effective_children_index_table: [
        {
          permissions: "101",
          vertex: "U1",
          intermediaries: [
            "U1"
          ]
        }
      ],
      direct_parent_index_table: [],
      effective_parent_index_table: []
    });
    
  });


  it('should calculate effective permissions correctly', async function () {

    const initialGraph = graphTest.loadJSON(path.join(__dirname, 'graphData.json'));

    graphTest.state.graph = initialGraph;
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, 'U1');
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, 'G1');
    
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, 'G2');
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, 'A1');

    await graphTest.graphSmartContract.updatePermissions(
      graphTest.ctx,
      'U1',
      'G1',
      '101',
      'ADD'
    );

    await graphTest.graphSmartContract.updatePermissions(
      graphTest.ctx,
      'G2',
      'A1',
      '001',
      'ADD'
    );

    
    await graphTest.graphSmartContract.updatePermissions(
      graphTest.ctx,
      'G1',
      'G2',
      '101',
      'ADD'
    );
    const graphState = graphTest.getGraphState();
    //console.log("graphState", graphState.find((item) => item.vertex == 'A1').effective_children_index_table);
    expect(graphState).to.deep.include({
      vertex: "A1",
      direct_children_index_table: [
        {
          permissions: "001",
          vertex: "G2"
        }
      ],
      effective_children_index_table: [
        {
          permissions: "001",
          vertex: "G2",
          intermediaries: [
            "G2"
          ]
        },
        {
          permissions: "001",
          vertex: "U1",
          intermediaries: [
            "G2"
          ]
        },
        {
          permissions: "001",
          vertex: "G1",
          intermediaries: [
            "G2"
          ]
        },
      ],
      direct_parent_index_table: [],
      effective_parent_index_table: []
    });
    
  });


  it('should match the expected graph structure', async function () {
    const initialGraph = graphTest.loadJSON(path.join(__dirname, 'graphData.json'));

    graphTest.state.graph = initialGraph;

    await graphTest.graphSmartContract.addVertex(graphTest.ctx, "U1" ); 
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, "G1" ); 
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, "G2" ); 
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, "A1" ); 
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, "A2" ); 
    await graphTest.graphSmartContract.addVertex(graphTest.ctx, "G3" );;
    await graphTest.graphSmartContract.updatePermissions(graphTest.ctx, 'U1', 'G1', '010', 'ADD');
    await graphTest.graphSmartContract.updatePermissions(graphTest.ctx, 'G1', 'A1', '100', 'ADD');
    await graphTest.graphSmartContract.updatePermissions(graphTest.ctx, 'G2', 'A1', '001', 'ADD');
    await graphTest.graphSmartContract.updatePermissions(graphTest.ctx, 'G3', 'A2', '101', 'ADD');
    await graphTest.graphSmartContract.updatePermissions(graphTest.ctx, 'G2', 'G3', '011', 'ADD');
    await graphTest.graphSmartContract.updatePermissions(graphTest.ctx, 'U1', 'G2', '100', 'ADD');

    const finalGraph = sortJsonArrays(graphTest.getGraphState());
    const expectedGraph = sortJsonArrays(graphTest.loadJSON('expectedGraph.json'));
    graphTest.saveJSON('outputGraph.json', finalGraph);

    expect(finalGraph).to.deep.equal(expectedGraph);
  });


  function sortJsonArrays(obj) {
    if (Array.isArray(obj)) {
        return obj
            .map(sortJsonArrays) 
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    } else if (obj && typeof obj === 'object') {
        return Object.keys(obj)
            .sort()
            .reduce((acc, key) => {
                acc[key] = sortJsonArrays(obj[key]);
                return acc;
            }, {});
    }
    return obj;
}

 
});
