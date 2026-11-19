import {
  contentFields,
  contentLanguages,
  domainDocument,
  fieldDocument,
  contentUpdate,
} from '../utils/helpers/content-fields.helper.js';

const queryFor = (query, fields) => {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return query;
  const parts = [];
  for (const [key, value] of Object.entries(query)) {
    if (['$or', '$and', '$nor'].includes(key)) {
      parts.push({ [key]: value.map((item) => queryFor(item, fields)) });
    } else if (key.startsWith('translations.')) {
      const [, code, field] = key.split('.');
      parts.push({ [`${field}.${code}`]: value });
    } else if (
      fields.includes(key) &&
      (typeof value === 'string' || value instanceof RegExp || value?.$regex)
    ) {
      parts.push({
        $or: [{ [key]: value }, ...contentLanguages.map((code) => ({ [`${key}.${code}`]: value }))],
      });
    } else parts.push({ [key]: value });
  }
  return parts.length === 1 ? parts[0] : parts.length ? { $and: parts } : {};
};

// One repository boundary keeps validation compatible without persisting a second copy of content.
export default function contentModel(database) {
  return {
    collection(name) {
      const collection = database.collection(name);
      const filter = (query) => queryFor(query, contentFields[name] || []);
      const update = async (method, query, data, options) => {
        const previous = name === 'users' ? await collection.findOne(filter(query)) : null;
        return collection[method](filter(query), contentUpdate(data, name, previous), options);
      };
      return {
        insertOne: (document, options) =>
          collection.insertOne(fieldDocument(document, name), options),
        insertMany: (documents, options) =>
          collection.insertMany(
            documents.map((document) => fieldDocument(document, name)),
            options,
          ),
        findOne: async (query, options) =>
          domainDocument(await collection.findOne(filter(query), options)),
        find: (query = {}, options) => collection.find(filter(query), options).map(domainDocument),
        updateOne: (query, data, options) => update('updateOne', query, data, options),
        updateMany: (query, data, options) => update('updateMany', query, data, options),
        findOneAndDelete: async (query, options) =>
          domainDocument(await collection.findOneAndDelete(filter(query), options)),
        countDocuments: (query, options) => collection.countDocuments(filter(query), options),
        deleteOne: (query, options) => collection.deleteOne(filter(query), options),
        deleteMany: (query, options) => collection.deleteMany(filter(query), options),
      };
    },
  };
}
