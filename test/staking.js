/** @var artifacts {Array} */
/** @var web3 {Web3} */
/** @function contract */
/** @function it */
/** @function before */
/** @var assert */

const {newMockContract, expectError} = require("./helper");

contract("Staking", async (accounts) => {
  const [owner, staker1, staker2, staker3, validator1, validator2, validator3, validator4, validator5] = accounts
  it("simple delegation", async () => {
    // 1 transaction = 1 block, current epoch length is 10 blocks
    const {parlia} = await newMockContract(owner)
    await parlia.addValidator(validator1);
    let res = await parlia.delegate(validator1, {from: staker1, value: '1000000000000000000'}); // 1.0
    assert.equal(res.logs[0].args.validator, validator1);
    assert.equal(res.logs[0].args.staker, staker1);
    assert.equal(res.logs[0].args.amount.toString(), '1000000000000000000');
    assert.equal(res.logs[0].args.epoch.toString(), '1');
    let result = await parlia.getValidatorDelegation(validator1, staker1);
    assert.equal(result.delegatedAmount.toString(), '1000000000000000000')
    res = await parlia.delegate(validator1, {from: staker2, value: '1000000000000000000'});
    assert.equal(res.logs[0].args.validator, validator1);
    assert.equal(res.logs[0].args.staker, staker2);
    assert.equal(res.logs[0].args.amount.toString(), '1000000000000000000');
    assert.equal(res.logs[0].args.epoch.toString(), '1');
    result = await parlia.getValidatorDelegation(validator1, staker2);
    assert.equal(result.delegatedAmount.toString(), '1000000000000000000')
    // check validator status
    result = await parlia.getValidatorStatus(validator1);
    assert.equal(result.totalDelegated.toString(), '2000000000000000000')
    assert.equal(result.status.toString(), '1')
  })
  it("undelegate should work on existing delegation", async () => {
    const {parlia} = await newMockContract(owner)
    await parlia.addValidator(validator1);
    await parlia.addValidator(validator2);
    await parlia.delegate(validator1, {from: staker1, value: '1000000000000000000'}); // +1.0
    assert.deepEqual(Array.from(await parlia.getValidators()), [validator1, validator2])
    await parlia.delegate(validator2, {from: staker2, value: '2000000000000000000'}); // +2.0
    assert.deepEqual(Array.from(await parlia.getValidators()), [validator2, validator1])
    assert.equal((await parlia.getValidatorStatus(validator1)).totalDelegated.toString(), '1000000000000000000')
    assert.equal((await parlia.getValidatorStatus(validator2)).totalDelegated.toString(), '2000000000000000000')
    let res = await parlia.undelegate(validator2, '1000000000000000000', {from: staker2}); // -1
    assert.equal(res.logs[0].args.validator, validator2);
    assert.equal(res.logs[0].args.staker, staker2);
    assert.equal(res.logs[0].args.amount.toString(), '1000000000000000000');
    assert.equal((await parlia.getValidatorStatus(validator1)).totalDelegated.toString(), '1000000000000000000')
    assert.equal((await parlia.getValidatorStatus(validator2)).totalDelegated.toString(), '1000000000000000000')
    assert.deepEqual(Array.from(await parlia.getValidators()), [validator1, validator2])
    assert.equal((await parlia.getValidatorDelegation(validator2, staker2)).delegatedAmount.toString(), '1000000000000000000')
    await parlia.undelegate(validator2, '1000000000000000000', {from: staker2})
    assert.equal((await parlia.getValidatorDelegation(validator2, staker2)).delegatedAmount.toString(), '0')
  });
  it("staker can't undelegate more than delegated", async () => {
    const {parlia} = await newMockContract(owner)
    await parlia.addValidator(validator1);
    // delegate 6 tokens to the validator
    await parlia.delegate(validator1, {from: staker1, value: '1000000000000000000'}); // +1.0
    assert.equal((await parlia.getValidatorDelegation(validator1, staker1)).delegatedAmount.toString(), '1000000000000000000')
    assert.equal((await parlia.getValidatorStatus(validator1)).totalDelegated.toString(), '1000000000000000000')
    await parlia.delegate(validator1, {from: staker1, value: '2000000000000000000'}); // +2.0
    assert.equal((await parlia.getValidatorDelegation(validator1, staker1)).delegatedAmount.toString(), '3000000000000000000')
    assert.equal((await parlia.getValidatorStatus(validator1)).totalDelegated.toString(), '3000000000000000000')
    await parlia.delegate(validator1, {from: staker1, value: '3000000000000000000'}); // +3.0
    assert.equal((await parlia.getValidatorDelegation(validator1, staker1)).delegatedAmount.toString(), '6000000000000000000')
    assert.equal((await parlia.getValidatorStatus(validator1)).totalDelegated.toString(), '6000000000000000000')
    // undelegate first 5
    await parlia.undelegate(validator1, '5000000000000000000', {from: staker1}); // -5.0
    assert.equal((await parlia.getValidatorDelegation(validator1, staker1)).delegatedAmount.toString(), '1000000000000000000')
    // undelegate second 2
    await expectError(parlia.undelegate(validator1, '2000000000000000000', {from: staker1}), 'Staking: insufficient balance') // -2.0
    assert.equal((await parlia.getValidatorDelegation(validator1, staker1)).delegatedAmount.toString(), '1000000000000000000')
    assert.equal((await parlia.getValidatorStatus(validator1)).totalDelegated.toString(), '1000000000000000000')
    // undelegate last 1
    await parlia.undelegate(validator1, '1000000000000000000', {from: staker1}); // -1.0
    assert.equal((await parlia.getValidatorDelegation(validator1, staker1)).delegatedAmount.toString(), '0')
    assert.equal((await parlia.getValidatorStatus(validator1)).totalDelegated.toString(), '0')
  })
  it("active validator order", async () => {
    const {parlia} = await newMockContract(owner)
    // check current epochs
    await parlia.addValidator(validator1); // 0x821aEa9a577a9b44299B9c15c88cf3087F3b5544
    await parlia.addValidator(validator2); // 0x0d1d4e623D10F9FBA5Db95830F7d3839406C6AF2
    await parlia.addValidator(validator3); // 0x2932b7A2355D6fecc4b5c0B6BD44cC31df247a2e
    await parlia.addValidator(validator4); // 0x2191eF87E392377ec08E7c08Eb105Ef5448eCED5
    await parlia.addValidator(validator5); // 0x0F4F2Ac550A1b4e2280d04c21cEa7EBD822934b5
    // delegate
    await parlia.delegate(validator1, {from: staker1, value: '3000000000000000000'}); // 3.0
    await parlia.delegate(validator2, {from: staker2, value: '2000000000000000000'}); // 2.0
    await parlia.delegate(validator3, {from: staker3, value: '1000000000000000000'}); // 1.0
    // make sure validators are sorted
    assert.deepEqual(Array.from(await parlia.getValidators()), [
      validator1,
      validator2,
      validator3,
    ])
    // delegate more to validator 4
    await parlia.delegate(validator4, {from: staker3, value: '4000000000000000000'}); // 4.0
    // check new active set
    assert.deepEqual(Array.from(await parlia.getValidators()), [
      validator4,
      validator1,
      validator2,
    ])
  });
  it("stake to non-existing validator", async () => {
    const {parlia} = await newMockContract(owner)
    await parlia.addValidator(validator1);
    await parlia.addValidator(validator3);
    await expectError(parlia.delegate(validator2, {
      from: staker1,
      value: '3000000000000000000'
    }), 'Staking: validator not found')
  });
  it("incorrect staking amounts", async () => {
    const {parlia} = await newMockContract(owner)
    await parlia.addValidator(validator1);
    await expectError(parlia.delegate(validator1, {
      from: staker1,
      value: '100000000000000000'
    }), 'Staking: amount too low') // 0.1
    await expectError(parlia.delegate(validator1, {
      from: staker1,
      value: '00000000000000000'
    }), 'Staking: amount too low') // 0
    await expectError(parlia.delegate(validator1, {
      from: staker1,
      value: '1100000000000000000'
    }), 'Staking: amount shouldn\'t have a remainder') // 1.1
  });
});
