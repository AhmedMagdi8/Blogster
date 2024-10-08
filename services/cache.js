const mongoose = require('mongoose');
const cli = require('nodemon/lib/cli');
const redis = require('redis');
const util = require('util');


const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);

client.hget = util.promisify(client.hget);

mongoose.Query.prototype.cache = function(options= {}) {
    this.useCache = true;
    this.hashKey = JSON.stringify(options.key || '');
    return this;
}

const exec = mongoose.Query.prototype.exec;
mongoose.Query.prototype.exec = async function() {

    if(!this.useCache) {
        return exec.apply(this, arguments);
    }

    console.log("I am about to run a query");

    console.log(this.getQuery());
    
    const key = JSON.stringify(Object.assign({}, this.getQuery(), {
            collection: this.mongooseCollection.name
    }));

    // See if we have a value of key in redis if we do return that
    const cacheValue = await client.hget(this.hashKey, key);
    
    // if we do return that
    if(cacheValue) {
        const doc = JSON.parse(cacheValue);
        return Array.isArray(doc) ? 
          doc.map(d => new this.model(d))
        : new this.model(doc);
    }

    // otherwise issue the query and store the result in redis
    const result = await exec.apply(this,arguments);

    client.set(key, JSON.stringify(result), 'EX', 2000);

    return result;
}

module.exports = {
    clearHash(hashKey) {
        client.del(JSON.stringify(hashKey));
    }
}