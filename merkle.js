
var crypto = require('crypto')
// var keccak256 = require('js-sha3').keccak256
var web3 = require('web3')
var through = require('through')

var ethUtils = require('ethereumjs-util')

var REGEXP = {
  'md5': '^[0-9a-f]{32}$',
  'sha1': '^[0-9a-f]{40}$',
  'ripemd160': '^[0-9a-f]{40}$',
  'keccak256': '^[0-9a-f]{64}$',
  'sha256': '^[0-9a-f]{64}$',
  'sha512': '^[0-9a-f]{128}$',
  'whirlpool': '^[0-9a-f]{128}$',
  'DEFAULT': '^$'
}

function Merkle (hashFunc, hashFuncName, useUpperCaseForHash) {
  var that = this

  var resFunc = function () {
    return root()
  }

  var regexpStr = REGEXP[hashFuncName] || REGEXP.DEFAULT
  if (useUpperCaseForHash) {
    // Use only capital letters if upper case is enabled
    // regexpStr = regexpStr.replace('a', 'A').replace('f', 'F')
  }
  that.hashResultRegexp = new RegExp(regexpStr)
  that.leaves = []
  that.treeDepth = 0
  that.rows = []
  that.nodesCount = 0

  function feed (anyData) {
    var data = String(anyData)
    if (data && data.match(that.hashResultRegexp)) {
      // Push leaf without hashing it since it is already a hash
      that.leaves.push(data)
    } else {
      var hash = web3.utils.soliditySha3(data)

      that.leaves.push(hash)
    }
    return that
  }

  function depth () {
    // Compute tree depth
    if (!that.treeDepth) {
      var pow = 0
      while (Math.pow(2, pow) < that.leaves.length) {
        pow++
      }
      that.treeDepth = pow
    }
    return that.treeDepth
  }

  function levels () {
    return depth() + 1
  }

  function nodes () {
    return that.nodesCount
  }

  function root () {
    return that.rows[0][0]
  }

  function level (i) {
    return that.rows[i]
  }

  function compute () {
    var theDepth = depth()
    if (that.rows.length === 0) {
      // Compute the nodes of each level
      for (var i = 0; i < theDepth; i++) {
        that.rows.push([])
      }
      that.rows[theDepth] = that.leaves
      for (var j = theDepth - 1; j >= 0; j--) {
        that.rows[j] = getNodes(that.rows[j + 1])
        that.nodesCount += that.rows[j].length
      }
    }
  }

  function getNodes (leaves) {
    var remainder = leaves.length % 2
    var nodes = []
    var hash
    for (var i = 0; i < leaves.length - 1; i = i + 2) {
      let el1, el2
      if (web3.utils.isHex(leaves[i])) {
        el1 = ethUtils.addHexPrefix(leaves[i])
      }
      if (web3.utils.isHex(leaves[i + 1])) {
        el2 = ethUtils.addHexPrefix(leaves[i + 1])
      }
      if (el1 < el2) {
        console.log('lets hash lol1 ', el1, el2)
        hash = web3.utils.soliditySha3(el1, el2)
      } else {
        console.log('lets hash lol2 ', el2, el1)
        console.log(web3.utils.soliditySha3("0x0175b7a638427703f0dbe7bb9bbf987a2551717b34e79f33b5b1008d1fa01db9","0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563")
)
        hash = web3.utils.soliditySha3(el2, el2)
      }
      console.log(' ok hashed', hash)
      // if (useUpperCaseForHash) {
      //   // hash = hash.toUpperCase()
      // }
      nodes[i / 2] = hash
    }
    if (remainder === 1) {
      nodes[((leaves.length - remainder) / 2)] = leaves[leaves.length - 1]
    }
    return nodes
  }

  function getProofPath (index, excludeParent, compact) {
    var proofPath = []
    var compactProofPath = []
    for (var currentLevel = depth(); currentLevel > 0; currentLevel--) {
      var currentLevelNodes = level(currentLevel)
      var currentLevelCount = currentLevelNodes.length

      // if this is an odd end node to be promoted up, skip to avoid proofs with null values
      if (index == currentLevelCount - 1 && currentLevelCount % 2 == 1) {
        index = Math.floor(index / 2)
        continue
      }

      var nodes = {}
      if (index % 2) { // the index is the right node
        nodes.left = currentLevelNodes[index - 1]
        nodes.right = currentLevelNodes[index]
        compactProofPath.push(nodes.left)
      } else {
        nodes.left = currentLevelNodes[index]
        nodes.right = currentLevelNodes[index + 1]
        compactProofPath.push(nodes.right)
      }

      index = Math.floor(index / 2) // set index to the parent index
      if (!excludeParent) {
        proofPath.push({
          parent: level(currentLevel - 1)[index],
          left: nodes.left,
          right: nodes.right
        })
      } else {
        proofPath.push({
          left: nodes.left,
          right: nodes.right
        })
      }
    }
    if (compact) return compactProofPath
    return proofPath
  }

  // PUBLIC

  /**
  * Return the stream, with resulting stream begin root hash string.
  **/
  var stream = through(
    function write (data) {
      feed('' + data)
    },
    function end () {
      compute()
      this.emit('data', resFunc())
      this.emit('end')
    })

  /**
  * Return the stream, but resulting stream will be json.
  **/
  stream.json = function () {
    resFunc = function () {
      return {
        root: root(),
        level: level(),
        depth: depth(),
        levels: levels(),
        nodes: nodes(),
        getProofPath: getProofPath
      }
    }
    return this
  }

  /**
  * Computes merkle tree synchronously, returning json result.
  **/
  stream.sync = function (leaves) {
    leaves.forEach(function (leaf) {
      feed(leaf)
    })
    compute()
    resFunc = function () {
      return {
        root: root,
        level: level,
        depth: depth,
        levels: levels,
        nodes: nodes,
        getProofPath: getProofPath
      }
    }
    return resFunc()
  }

  /**
  * Computes merkle tree asynchronously, returning json as callback result.
  **/
  stream.async = function (leaves, done) {
    leaves.forEach(function (leaf) {
      feed(leaf)
    })
    compute()
    resFunc = function () {
      return {
        root: root,
        level: level,
        depth: depth,
        levels: levels,
        nodes: nodes,
        getProofPath: getProofPath
      }
    }
    done(null, resFunc())
  }

  return stream
}

module.exports = function (hashFuncName, useUpperCaseForHash) {
  return new Merkle(function (input) {
    if (hashFuncName === 'none') {
      return input
    } else if (hashFuncName === 'keccak256') {
      console.log("Wrong road traveeler")
    //   console.log(ethUtils.addHexPrefix(input))
    //   console.log(typeof ethUtils.addHexPrefix(input))
    //   if (web3.utils.isHex(input)) {
    //     return web3.utils.soliditySha3(ethUtils.addHexPrefix(input))
    //   } else {
    //     return web3.utils.soliditySha3(input)
    //   }
    // } else {
    //   var hash = crypto.createHash(hashFuncName)
    //   return hash.update(input).digest('hex')
    }
  }, hashFuncName,

  // Use upper case y default
  useUpperCaseForHash !== true)
}
