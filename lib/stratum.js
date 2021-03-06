"use strict";
Object.defineProperty(exports, "__esModule", {value: true});
const net = require("net");
const events_1 = require("events");
const util = require("./util.js");
class SubscriptionCounter {
    constructor() {
        this.count = 0;
        this.padding = 'deadbeefcafebabe';
    }
    next() {
        this.count++;
        if (Number.MAX_VALUE === this.count)
            this.count = 0;
        return this.padding + util.packInt64LE(this.count).toString('hex');
    }
}
class StratumClient extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.pendingDifficulty = null;
        this.options = options;
        this.remoteAddress = options.socket.remoteAddress;
        this.lastActivity = Date.now();
        this.shares = {valid: 0, invalid: 0};
        this.considerBan = (!this.options.banning || !this.options.banning.enabled) ? function () {
            return false;
        } : (shareValid) => {
            if (shareValid === true)
                this.shares.valid++;
            else
                this.shares.invalid++;
            const totalShares = this.shares.valid + this.shares.invalid;
            if (totalShares >= this.options.banning.checkThreshold) {
                const percentBad = (this.shares.invalid / totalShares) * 100;
                if (percentBad < this.options.banning.invalidPercent)
                    this.shares = {valid: 0, invalid: 0};
                else {
                    this.emit('triggerBan', this.shares.invalid + ' out of the last ' + totalShares + ' shares were invalid');
                    this.socket.destroy();
                    return true;
                }
            }
            return false;
        };
    }
    init() {
        this.setupSocket();
    }
    ;
    handleMessage(message) {
        switch (message.method) {
            case 'mining.subscribe':
                this.handleSubscribe(message);
                break;
            case 'mining.authorize':
                this.handleAuthorize(message, true);
                break;
            case 'mining.submit':
                this.lastActivity = Date.now();
                this.handleSubmit(message);
                break;
            case 'mining.get_transactions':
                this.sendJson({
                    id: null,
                    result: [],
                    error: true
                });
                break;
            default:
                this.emit('unknownStratumMethod', message);
                break;
        }
    }
    handleSubscribe(message) {
        if (!this.authorized) {
            this.requestedSubscriptionBeforeAuth = true;
        }
        this.emit('subscription', {}, (error, extraNonce1, extraNonce2Size) => {
            if (error) {
                this.sendJson({
                    id: message.id,
                    result: null,
                    error: error
                });
                return;
            }
            this.extraNonce1 = extraNonce1;
            this.sendJson({
                id: message.id,
                result: [
                    [
                        ["mining.set_difficulty", this.options.subscriptionId],
                        ["mining.notify", this.options.subscriptionId]
                    ],
                    extraNonce1,
                    extraNonce2Size
                ],
                error: null
            });
        });
    }
    handleAuthorize(message, replyToSocket) {
        this.workerName = message.params[0];
        this.workerPass = message.params[1];
        this.options.authorizeFn(this.remoteAddress, this.options.socket.localPort, this.workerName, this.workerPass, (result) => {
            this.authorized = (!result.error && result.authorized);
            if (replyToSocket) {
                this.sendJson({
                    id: message.id,
                    result: this.authorized,
                    error: result.error
                });
            }
            if (result.disconnect === true) {
                this.options.socket.destroy();
            }
        });
    }
    handleSubmit(message) {
        if (!this.authorized) {
            this.sendJson({
                id: message.id,
                result: null,
                error: [24, "unauthorized worker", null]
            });
            this.considerBan(false);
            return;
        }
        if (!this.extraNonce1) {
            this.sendJson({
                id: message.id,
                result: null,
                error: [25, "not subscribed", null]
            });
            this.considerBan(false);
            return;
        }
        this.emit('submit', {
            name: message.params[0],
            jobId: message.params[1],
            extraNonce2: message.params[2],
            nTime: message.params[3],
            nonce: message.params[4]
        }, (error, result) => {
            if (!this.considerBan(result)) {
                this.sendJson({
                    id: message.id,
                    result: result,
                    error: error
                });
            }
        });
    }
    sendJson(...args) {
        let response = '';
        for (let i = 0; i < args.length; i++) {
            response += JSON.stringify(args[i]) + '\n';
        }
        this.options.socket.write(response);
    }
    setupSocket() {
        const socket = this.options.socket;
        let dataBuffer = '';
        socket.setEncoding('utf8');
        if (this.options.tcpProxyProtocol === true) {
            socket.once('data', (d) => {
                if (d.indexOf('PROXY') === 0) {
                    this.remoteAddress = d.split(' ')[2];
                }
                else {
                    this.emit('tcpProxyError', d);
                }
                this.emit('checkBan');
            });
        }
        else {
            this.emit('checkBan');
        }
        socket.on('data', (d) => {
            dataBuffer += d;
            if (Buffer.byteLength(dataBuffer, 'utf8') > 10240) {
                dataBuffer = '';
                this.emit('socketFlooded');
                socket.destroy();
                return;
            }
            if (dataBuffer.indexOf('\n') !== -1) {
                const messages = dataBuffer.split('\n');
                const incomplete = dataBuffer.slice(-1) === '\n' ? '' : messages.pop();
                messages.forEach((message) => {
                    if (message === '')
                        return;
                    let messageJson;
                    try {
                        messageJson = JSON.parse(message);
                    }
                    catch (e) {
                        if (this.options.tcpProxyProtocol !== true || d.indexOf('PROXY') !== 0) {
                            this.emit('malformedMessage', message);
                            socket.destroy();
                        }
                        return;
                    }
                    if (messageJson) {
                        this.handleMessage(messageJson);
                    }
                });
                dataBuffer = incomplete;
            }
        });
        socket.on('close', function () {
            this.emit('socketDisconnect');
        });
        socket.on('error', function (err) {
            if (err.code !== 'ECONNRESET')
                this.emit('socketError', err);
        });
    }
    enqueueNextDifficulty(requestedNewDifficulty) {
        this.pendingDifficulty = requestedNewDifficulty;
        return true;
    }
    ;
    sendDifficulty(difficulty) {
        if (difficulty === this.difficulty)
            return false;
        this.previousDifficulty = this.difficulty;
        this.difficulty = difficulty;
        this.sendJson({
            id: null,
            method: "mining.set_difficulty",
            params: [difficulty]
        });
        return true;
    }
    ;
    manuallyAuthClient(username, password) {
        this.handleAuthorize({id: 1, params: [username, password]}, false);
    }
    ;
    manuallySetValues(otherClient) {
        this.extraNonce1 = otherClient.extraNonce1;
        this.previousDifficulty = otherClient.previousDifficulty;
        this.difficulty = otherClient.difficulty;
    }
    ;
}
exports.StratumClient = StratumClient;
class StratumServer extends events_1.EventEmitter {
    constructor(options, authorizeFn) {
        super();
        this.authorizeFn = authorizeFn;
        this.bannedMS = options.banning ? options.banning.time * 1000 : null;
        this.stratumClients = {};
        this.subscriptionCounter = new SubscriptionCounter();
        this.bannedIPs = {};
        this.init();
    }
    init() {
        if (this.options.banning && this.options.banning.enabled) {
            setInterval(() => {
                for (let ip in this.bannedIPs) {
                    if (!this.bannedIPs.hasOwnProperty(ip)) {
                        continue;
                    }
                    const banTime = this.bannedIPs[ip];
                    if (Date.now() - banTime > this.options.banning.time)
                        delete this.bannedIPs[ip];
                }
            }, 1000 * this.options.banning.purgeInterval);
        }
        let serversStarted = 0;
        Object.keys(this.options.ports).forEach((port) => {
            net.createServer({allowHalfOpen: false}, (socket) => {
                this.handleNewClient(socket);
            }).listen(parseInt(port), () => {
                serversStarted++;
                if (serversStarted == Object.keys(this.options.ports).length)
                    this.emit('started');
            });
        });
    }
    checkBan(client) {
        if (this.options.banning && this.options.banning.enabled && client.remoteAddress in this.bannedIPs) {
            const bannedTime = this.bannedIPs[client.remoteAddress];
            const bannedTimeAgo = Date.now() - bannedTime;
            const timeLeft = this.bannedMS - bannedTimeAgo;
            if (timeLeft > 0) {
                client.socket.destroy();
                client.emit('kickedBannedIP', timeLeft / 1000 | 0);
            }
            else {
                delete this.bannedIPs[client.remoteAddress];
                client.emit('forgaveBannedIP');
            }
        }
    }
    handleNewClient(socket) {
        socket.setKeepAlive(true);
        const subscriptionId = this.subscriptionCounter.next();
        const client = new StratumClient({
            subscriptionId: subscriptionId,
            authorizeFn: this.authorizeFn,
            socket: socket,
            banning: this.options.banning,
            connectionTimeout: this.options.connectionTimeout,
            tcpProxyProtocol: this.options.tcpProxyProtocol
        });
        this.stratumClients[subscriptionId] = client;
        this.emit('client.connected', client);
        client.on('socketDisconnect', () => {
            this.removeStratumClientBySubId(this.subscriptionId);
            this.emit('client.disconnected', client);
        }).on('checkBan', () => {
            this.checkBan(client);
        }).on('triggerBan', () => {
            this.addBannedIP(client.remoteAddress);
        }).init();
        return subscriptionId;
    }
    ;
    broadcastMiningJobs(jobParams) {
        for (const clientId in this.stratumClients) {
            const client = this.stratumClients[clientId];
            client.sendMiningJob(jobParams);
        }
        clearTimeout(this.rebroadcastTimeout);
        this.rebroadcastTimeout = setTimeout(() => {
            this.emit('broadcastTimeout');
        }, this.options.jobRebroadcastTimeout * 1000);
    }
    ;
    addBannedIP(ipAddress) {
        this.bannedIPs[ipAddress] = Date.now();
    }
    ;
    getStratumClients() {
        return this.stratumClients;
    }
    ;
    removeStratumClientBySubId(subscriptionId) {
        delete this.stratumClients[subscriptionId];
    }
    ;
    manuallyAddStratumClient(clientObj) {
        const subId = this.handleNewClient(clientObj.socket);
        if (subId != null) {
            this.stratumClients[subId].manuallyAuthClient(clientObj.workerName, clientObj.workerPass);
            this.stratumClients[subId].manuallySetValues(clientObj);
        }
    }
    ;
}
exports.StratumServer = StratumServer;
