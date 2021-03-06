"use strict";
Object.defineProperty(exports, "__esModule", {value: true});
const merkleTree_1 = require("./merkleTree");
const transactions = require("./transactions");
const util = require("./util");
const algoProperties_1 = require("./algoProperties");
class BlockTemplate {
    constructor(jobId, rpcData, poolAddressScript, extraNoncePlaceholder, reward, txMessages, recipients) {
        this.submits = [];
        this.submits = [];
        this.rpcData = rpcData;
        this.jobId = jobId;
        this.reward = reward;
        this.target = rpcData.target ?
            BigInt("0x" + rpcData.target) :
            util.bignumFromBitsHex(rpcData.bits);
        this.difficulty = parseFloat((algoProperties_1.diff1 / Number(this.target)).toFixed(9));
        this.prevHashReversed = util.reverseByteOrder(new Buffer(rpcData.previousblockhash, 'hex')).toString('hex');
        this.transactionData = Buffer.concat(rpcData.transactions.map(function (tx) {
            return new Buffer(tx.data, 'hex');
        }));
        this.merkleTree = new merkleTree_1.default(this.getTransactionBuffers(rpcData.transactions));
        this.merkleBranch = BlockTemplate.getMerkleHashes(this.merkleTree.steps);
        this.generationTransaction = transactions.createGeneration(rpcData, poolAddressScript, extraNoncePlaceholder, reward, txMessages, recipients);
    }
    static getMerkleHashes(steps) {
        return steps.map(function (step) {
            return step.toString('hex');
        });
    }
    serializeCoinbase(extraNonce1, extraNonce2) {
        return Buffer.concat([
            this.generationTransaction[0],
            extraNonce1,
            extraNonce2,
            this.generationTransaction[1]
        ]);
    }
    ;
    serializeHeader(merkleRoot, nTime, nonce) {
        let header = new Buffer(80);
        let position = 0;
        header.write(nonce, position, 4, 'hex');
        header.write(this.rpcData.bits, position += 4, 4, 'hex');
        header.write(nTime, position += 4, 4, 'hex');
        header.write(merkleRoot, position += 4, 32, 'hex');
        header.write(this.rpcData.previousblockhash, position += 32, 32, 'hex');
        header.writeUInt32BE(this.rpcData.version, position + 32);
        header = util.reverseBuffer(header);
        return header;
    }
    ;
    serializeBlock(header, coinbase) {
        return Buffer.concat([
            header,
            util.varIntBuffer(this.rpcData.transactions.length + 1),
            coinbase,
            this.transactionData,
            this.getVoteData(),
            new Buffer(this.reward === 'POS' ? [0] : [])
        ]);
    }
    ;
    registerSubmit(extraNonce1, extraNonce2, nTime, nonce) {
        const submission = extraNonce1 + extraNonce2 + nTime + nonce;
        if (this.submits.indexOf(submission) === -1) {
            this.submits.push(submission);
            return true;
        }
        return false;
    }
    ;
    getJobParams() {
        if (!this.jobParams) {
            this.jobParams = [
                this.jobId,
                this.prevHashReversed,
                this.generationTransaction[0].toString('hex'),
                this.generationTransaction[1].toString('hex'),
                this.merkleBranch,
                util.packInt32BE(this.rpcData.version).toString('hex'),
                this.rpcData.bits,
                util.packUInt32BE(this.rpcData.curtime).toString('hex'),
                true
            ];
        }
        return this.jobParams;
    }
    ;
    getTransactionBuffers(txs) {
        const txHashes = txs.map(function (tx) {
            if (tx.txid !== undefined) {
                return util.uint256BufferFromHash(tx.txid);
            }
            return util.uint256BufferFromHash(tx.hash);
        });
        return [null].concat(txHashes);
    }
    getVoteData() {
        if (!this.rpcData.masternode_payments)
            return new Buffer([]);
        return Buffer.concat([util.varIntBuffer(this.rpcData.votes.length)].concat(this.rpcData.votes.map(function (vt) {
            return new Buffer(vt, 'hex');
        })));
    }
}
exports.BlockTemplate = BlockTemplate;
