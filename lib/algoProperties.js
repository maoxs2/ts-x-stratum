"use strict";
Object.defineProperty(exports, "__esModule", {value: true});
const multiHashing = require("x-hashing");
const util = require("./util.js");
const diff1 = 0x00000000ffff0000000000000000000000000000000000000000000000000000;
exports.diff1 = diff1;
const algorithms = {
    "sha256": {
        hash: function () {
            return () => {
                return util.sha256d.apply(this, arguments);
            };
        }
    },
    "scrypt": {
        multiplier: Math.pow(2, 16),
        hash: function (coinConfig) {
            const nValue = coinConfig.nValue || 1024;
            const rValue = coinConfig.rValue || 1;
            return function (data) {
                return multiHashing.scrypt(data, nValue, rValue);
            };
        }
    },
    'scrypt-og': {
        multiplier: Math.pow(2, 16),
        hash: function (coinConfig) {
            const nValue = coinConfig.nValue || 64;
            const rValue = coinConfig.rValue || 1;
            return function (data) {
                return multiHashing.scrypt(data, nValue, rValue);
            };
        }
    },
    'scrypt-jane': {
        multiplier: Math.pow(2, 16),
        hash: function (coinConfig) {
            const nTimestamp = coinConfig.chainStartTime || 1367991200;
            const nMin = coinConfig.nMin || 4;
            const nMax = coinConfig.nMax || 30;
            return function (data, nTime) {
                return multiHashing.scryptjane(data, nTime, nTimestamp, nMin, nMax);
            };
        }
    },
    'scrypt-n': {
        multiplier: Math.pow(2, 16),
        hash: function (coinConfig) {
            const timeTable = coinConfig.timeTable || {
                "2048": 1389306217, "4096": 1456415081, "8192": 1506746729, "16384": 1557078377, "32768": 1657741673,
                "65536": 1859068265, "131072": 2060394857, "262144": 1722307603, "524288": 1769642992
            };
            const nFactor = (function () {
                const n = Object.keys(timeTable).sort().reverse().filter(function (nKey) {
                    return Date.now() / 1000 > timeTable[nKey];
                })[0];
                const nInt = parseInt(n);
                return Math.log(nInt) / Math.log(2);
            })();
            return function (data) {
                return multiHashing.scryptn(data, nFactor);
            };
        }
    },
    "sha1": {
        hash: function () {
            return () => {
                return multiHashing.sha1.apply(this, arguments);
            };
        }
    },
    "c11": {
        hash: function () {
            return () => {
                return multiHashing.c11.apply(this, arguments);
            };
        }
    },
    "x11": {
        hash: function () {
            return () => {
                return multiHashing.x11.apply(this, arguments);
            };
        }
    },
    "x13": {
        hash: function () {
            return () => {
                return multiHashing.x13.apply(this, arguments);
            };
        }
    },
    "x15": {
        hash: function () {
            return () => {
                return multiHashing.x15.apply(this, arguments);
            };
        }
    },
    "x16r": {
        multiplier: Math.pow(2, 8),
        hash: function () {
            return () => {
                return multiHashing.x16r.apply(this, arguments);
            };
        }
    },
    "x16rv2": {
        multiplier: Math.pow(2, 8),
        hash: function () {
            return () => {
                return multiHashing.x16rv2.apply(this, arguments);
            };
        }
    },
    "nist5": {
        hash: function () {
            return () => {
                return multiHashing.nist5.apply(this, arguments);
            };
        }
    },
    "quark": {
        hash: function () {
            return () => {
                return multiHashing.quark.apply(this, arguments);
            };
        }
    },
    "keccak": {
        multiplier: Math.pow(2, 8),
        hash: function (coinConfig) {
            if (coinConfig.normalHashing === true) {
                return function (data, nTimeInt) {
                    return multiHashing.keccak(multiHashing.keccak(Buffer.concat([data, new Buffer(nTimeInt.toString('hex'), 'hex')])));
                };
            }
            else {
                return () => {
                    return multiHashing.keccak.apply(this, arguments);
                };
            }
        }
    },
    "blake": {
        multiplier: Math.pow(2, 8),
        hash: function () {
            return () => {
                return multiHashing.blake.apply(this, arguments);
            };
        }
    },
    "neoscrypt": {
        multiplier: Math.pow(2, 5),
        hash: function () {
            return () => {
                return multiHashing.neoscrypt.apply(this, arguments);
            };
        }
    },
    "skein": {
        hash: function () {
            return () => {
                return multiHashing.skein.apply(this, arguments);
            };
        }
    },
    "groestl": {
        multiplier: Math.pow(2, 8),
        hash: function () {
            return () => {
                return multiHashing.groestl.apply(this, arguments);
            };
        }
    },
    "fugue": {
        multiplier: Math.pow(2, 8),
        hash: function () {
            return () => {
                return multiHashing.fugue.apply(this, arguments);
            };
        }
    },
    "shavite3": {
        hash: function () {
            return () => {
                return multiHashing.shavite3.apply(this, arguments);
            };
        }
    },
    "hefty1": {
        hash: function () {
            return () => {
                return multiHashing.hefty1.apply(this, arguments);
            };
        }
    },
    "qubit": {
        hash: function () {
            return () => {
                return multiHashing.qubit.apply(this, arguments);
            };
        }
    }
};
exports.algorithms = algorithms;
for (const algorithm in algorithms) {
    if (!algorithms.hasOwnProperty(algorithm)) {
        continue;
    }
    if (!algorithms[algorithm].multiplier)
        algorithms[algorithm].multiplier = 1;
}
