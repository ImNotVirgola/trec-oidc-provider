'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DIRECTORY = path.join(process.env.TREC_DATA_DIR || path.join(__dirname, '..', '.oidc-data'), 'accounts');

// Durata massima dei dati verificati: 30 giorni.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function encryptionKey() {
    const hex = process.env.OIDC_STORAGE_KEY;

    if (!/^[a-f0-9]{64}$/i.test(hex || '')) {
        throw new Error('OIDC_STORAGE_KEY mancante o non valida');
    }

    // Deriva una chiave specifica per i dati degli account.
    return Buffer.from(crypto.hkdfSync(
        'sha256',
        Buffer.from(hex, 'hex'),
        Buffer.from('trec-oidc'),
        Buffer.from('verified-account-claims-v1'),
        32
    ));
}

function accountFile(accountId) {
    if (typeof accountId !== 'string' || !accountId.trim()) {
        throw new Error('accountId non valido');
    }

    const filename = crypto
        .createHash('sha256')
        .update(accountId)
        .digest('hex');

    return path.join(DIRECTORY, filename + '.enc');
}

function saveAccount(accountId, claims) {
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
        throw new Error('Attributi account non validi');
    }

    const destination = accountFile(accountId);
    const iv = crypto.randomBytes(12);

    const record = {
        accountId,
        claims,
        expiresAt: Date.now() + MAX_AGE_MS
    };

    const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        encryptionKey(),
        iv
    );

    cipher.setAAD(Buffer.from(accountId, 'utf8'));

    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(record), 'utf8'),
        cipher.final()
    ]);

    const encrypted = {
        version: 1,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64')
    };

    fs.mkdirSync(DIRECTORY, {
        recursive: true,
        mode: 0o700
    });

    const temporary = destination + '.' +
        process.pid + '.' +
        crypto.randomBytes(6).toString('hex') + '.tmp';

    try {
        fs.writeFileSync(
            temporary,
            JSON.stringify(encrypted),
            { mode: 0o600, flag: 'wx' }
        );

        fs.renameSync(temporary, destination);
    } finally {
        fs.rmSync(temporary, { force: true });
    }
}

function loadAccount(accountId) {
    const filename = accountFile(accountId);

    let encrypted;

    try {
        encrypted = JSON.parse(
            fs.readFileSync(filename, 'utf8')
        );
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }

    if (encrypted.version !== 1) {
        throw new Error('Versione archivio account non valida');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        encryptionKey(),
        Buffer.from(encrypted.iv, 'base64')
    );

    decipher.setAAD(Buffer.from(accountId, 'utf8'));

    decipher.setAuthTag(
        Buffer.from(encrypted.tag, 'base64')
    );

    const plaintext = Buffer.concat([
        decipher.update(
            Buffer.from(encrypted.ciphertext, 'base64')
        ),
        decipher.final()
    ]);

    const record = JSON.parse(plaintext.toString('utf8'));

    if (record.accountId !== accountId) {
        throw new Error('Account ID non corrispondente');
    }

    if (Date.now() >= record.expiresAt) {
        fs.rmSync(filename, { force: true });
        return null;
    }

    return record.claims;
}

function deleteAccount(accountId) {
    fs.rmSync(accountFile(accountId), { force: true });
}

module.exports = {
    saveAccount,
    loadAccount,
    deleteAccount
};
