const names = Object.freeze([
  'issuerDid',
  'holderDid',
  'givenName',
  'familyName',
  'dateOfBirth',
  'phone',
  'email',
  'fiscalCode',
  'gender'
]);

function request(definitionId, nonce) {
  return {
    name: 'TREC authentication',
    version: '1.0',
    nonce,
    requested_attributes: Object.fromEntries(
      names.map((name) => [
        name,
        {
          name
        }
      ])
    ),
    requested_predicates: {}
  };
}

function valueOf(entry) {
  const raw = entry?.raw;
  return typeof raw === 'string' && raw.trim()
    ? raw
    : undefined;
}

function indexOf(entry) {
  const index =
    entry?.sub_proof_index ??
    entry?.subProofIndex;

  return Number.isInteger(index) && index >= 0
    ? index
    : undefined;
}

function extract(formats, definitionId, nonce) {
  const requestData = formats?.request?.anoncreds;

  if (String(requestData?.nonce) !== String(nonce)) {
    throw new Error('nonce_mismatch');
  }

  const proof = formats?.presentation?.anoncreds;

  const requestedProof =
    proof?.requested_proof ??
    proof?.requestedProof;

  if (!proof || !requestedProof) {
    throw new Error('missing_requested_proof');
  }

  const revealed =
    requestedProof.revealed_attrs ??
    requestedProof.revealedAttributes ??
    {};

  const groups =
    requestedProof.revealed_attr_groups ??
    requestedProof.revealedAttributeGroups ??
    {};

  const result = {};
  const indexes = {};

  for (const name of names) {
    const direct = revealed[name];
    const directValue = valueOf(direct);

    if (directValue !== undefined) {
      result[name] = directValue;
      indexes[name] = indexOf(direct);
      continue;
    }

    let found = false;

    for (const group of Object.values(groups)) {
      const values = group?.values ?? {};
      const groupedValue = valueOf(values[name]);

      if (groupedValue !== undefined) {
        result[name] = groupedValue;
        indexes[name] = indexOf(group);
        found = true;
        break;
      }
    }

    if (!found) {
      throw new Error(`missing_attribute:${name}`);
    }
  }

  const index = indexes.holderDid;

  if (
    !Number.isInteger(index) ||
    names.some((name) => indexes[name] !== index)
  ) {
    throw new Error('mixed_credentials');
  }

  const identifier = proof.identifiers?.[index];

  const credentialDefinitionId =
    identifier?.cred_def_id ??
    identifier?.credentialDefinitionId;

  if (credentialDefinitionId !== definitionId) {
    throw new Error('wrong_definition');
  }

  if (
    result.issuerDid !== definitionId.split('/resources/')[0] ||
    !/^did:[a-z0-9]+:\S+$/.test(result.holderDid)
  ) {
    throw new Error('invalid_identity');
  }

  return Object.freeze(result);
}

module.exports = {
  names,
  request,
  extract
};
