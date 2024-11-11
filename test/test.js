const assert = require('assert');
const sinon = require('sinon');
const GraphSmartContract = require('../lib/graphsmartcontract');

describe('updatePermissions', () => {
  let ctx, graphSmartContract;

  beforeEach(() => {
    ctx = {
      stub: {
        createCompositeKey: sinon.stub(),
        getState: sinon.stub(),
        putState: sinon.stub()
      }
    };
    graphSmartContract = new GraphSmartContract();
  });

  it('should throw error for missing required parameters', async () => {
    try {
      await graphSmartContract.updatePermissions(ctx, null, 'destinationVertexId', 'permissions', 'operation');
      assert.fail('Expected error to be thrown');
    } catch (err) {
      assert.equal(err.message, 'Missing required parameters');
    }
  });

  it('should throw error for non-existent source vertex', async () => {
    ctx.stub.getState.resolves(null);
    try {
      await graphSmartContract.updatePermissions(ctx, 'sourceVertexId', 'destinationVertexId', 'permissions', 'operation');
      assert.fail('Expected error to be thrown');
    } catch (err) {
      assert.equal(err.message, 'sourceVertexId does not exist');
    }
  });

  it('should throw error for non-existent destination vertex', async () => {
    ctx.stub.getState.onCall(0).resolves('sourceVertex');
    ctx.stub.getState.onCall(1).resolves(null);
    try {
      await graphSmartContract.updatePermissions(ctx, 'sourceVertexId', 'destinationVertexId', 'permissions', 'operation');
      assert.fail('Expected error to be thrown');
    } catch (err) {
      assert.equal(err.message, 'destinationVertexId does not exist');
    }
  });

  it('should successfully update permissions', async () => {
    const sourceVertexJson = { effective_children_index_table: [] };
    const destinationVertexJson = { effective_parent_index_table: [] };
    ctx.stub.getState.onCall(0).resolves(Buffer.from(JSON.stringify(sourceVertexJson)));
    ctx.stub.getState.onCall(1).resolves(Buffer.from(JSON.stringify(destinationVertexJson)));
    console.log(sourceVertexJson)
    await graphSmartContract.updatePermissions(ctx, 'sourceVertexId', 'destinationVertexId', 'permissions', 'operation');
    assert(ctx.stub.putState.calledTwice);
  });

  it('should handle error during permission update', async () => {
    ctx.stub.getState.onCall(0).resolves('sourceVertex');
    ctx.stub.getState.onCall(1).resolves('destinationVertex');
    sinon.stub(graphSmartContract, 'updatePermissionsHelper').rejects(new Error('Test error'));
    try {
      await graphSmartContract.updatePermissions(ctx, 'sourceVertexId', 'destinationVertexId', 'permissions', 'operation');
      assert.fail('Expected error to be thrown');
    } catch (err) {
      assert.equal(err.message, 'Failed to update permissions');
    }
  });
});