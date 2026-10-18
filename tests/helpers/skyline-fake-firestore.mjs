/**
 * Minimal in-memory Firestore double shared by tests/skyline-jobs.test.mjs and
 * tests/skyline-ingestion.test.mjs (Workstream C — skyline thumbnail pipeline).
 *
 * Supports collection().doc().get()/set()/update()/delete(), collection().where(field, op,
 * value).get(), and a runTransaction() that is fully serialized (a mutex chain) so a
 * transaction's read-modify-write is atomic and never interleaves with another transaction —
 * exactly the guarantee real Firestore transactions give, and the property
 * createThumbnailJobQueue's "two concurrent claims can't take one job" test actually depends
 * on (a naive get()+update() pair, by contrast, WOULD race under this same fake, because plain
 * doc.get()/set() below yield a microtask before resolving).
 *
 * Lives under tests/helpers/ (an existing convention in this repo — see load-core.mjs,
 * fake-media.mjs) rather than being embedded in one of the *.test.mjs files, so importing it
 * from a second test file does not also re-register/re-run the first file's test suite.
 */

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}
function clone(x) {
  return x === undefined ? x : JSON.parse(JSON.stringify(x));
}
function randomId() {
  return `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function createFakeFirestore() {
  const store = new Map(); // collectionName -> Map(docId -> data)
  let txChain = Promise.resolve();

  function collectionMap(name) {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name);
  }
  function applyFilter(data, { field, op, value }) {
    const actual = field.split('.').reduce((o, k) => (o || {})[k], data);
    switch (op) {
      case '==':
        return actual === value;
      case '!=':
        return actual !== value;
      case '<':
        return actual < value;
      case '<=':
        return actual <= value;
      case '>':
        return actual > value;
      case '>=':
        return actual >= value;
      case 'in':
        return Array.isArray(value) && value.includes(actual);
      default:
        throw new Error(`Unsupported operator: ${op}`);
    }
  }

  function makeDocRef(collectionName, id) {
    return {
      id,
      async get() {
        const map = collectionMap(collectionName);
        const exists = map.has(id);
        const data = exists ? clone(map.get(id)) : undefined;
        return { exists, id, data: () => data, ref: this };
      },
      async set(data, opts) {
        await tick();
        const map = collectionMap(collectionName);
        if (opts && opts.merge) {
          const prev = map.get(id) || {};
          map.set(id, { ...prev, ...clone(data) });
        } else {
          map.set(id, clone(data));
        }
      },
      async update(data) {
        await tick();
        const map = collectionMap(collectionName);
        if (!map.has(id)) throw new Error(`No document to update: ${collectionName}/${id}`);
        map.set(id, { ...map.get(id), ...clone(data) });
      },
      async delete() {
        await tick();
        collectionMap(collectionName).delete(id);
      },
    };
  }

  function makeQuery(name, filters) {
    return {
      where(field, op, value) {
        return makeQuery(name, [...filters, { field, op, value }]);
      },
      async get() {
        await tick();
        const map = collectionMap(name);
        const docs = [];
        for (const [id, data] of map.entries()) {
          if (filters.every((f) => applyFilter(data, f))) {
            docs.push({ id, data: () => clone(data), ref: makeDocRef(name, id), exists: true });
          }
        }
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
  }

  function makeCollectionRef(name) {
    return {
      doc(id) {
        return makeDocRef(name, id || randomId());
      },
      where(field, op, value) {
        return makeQuery(name, [{ field, op, value }]);
      },
      async get() {
        return makeQuery(name, []).get();
      },
    };
  }

  async function runTransaction(updateFunction) {
    const run = async () => {
      const pendingWrites = [];
      const tx = {
        async get(ref) {
          return ref.get();
        },
        set(ref, data, opts) {
          pendingWrites.push(() => ref.set(data, opts));
        },
        update(ref, data) {
          pendingWrites.push(() => ref.update(data));
        },
        delete(ref) {
          pendingWrites.push(() => ref.delete());
        },
      };
      const result = await updateFunction(tx);
      for (const w of pendingWrites) {
        // eslint-disable-next-line no-await-in-loop
        await w();
      }
      return result;
    };

    // Chain onto the lock so transactions never interleave (mirrors Firestore's isolation).
    const previous = txChain;
    let release;
    txChain = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await run();
    } finally {
      release();
    }
  }

  return {
    collection(name) {
      return makeCollectionRef(name);
    },
    runTransaction,
    _dump(name) {
      return Array.from(collectionMap(name).entries());
    },
  };
}
