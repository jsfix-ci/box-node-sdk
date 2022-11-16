'use strict';

const path = require('path');
const { getAppClient, getUserClient, getAdminClient } = require('../context');
const { createBoxTestFile } = require('../objects/box-test-file');
const { createBoxTestFolder } = require('../objects/box-test-folder');
const { createBoxTestRetentionPolicy } = require('../objects/box-test-retention-policy');
const { createBoxTestUser, clearUserContent } = require('../objects/box-test-user');
const context = {};

beforeAll(async() => {
	let appClient = getAppClient();
	let user = await createBoxTestUser(appClient);
	let userClient = getUserClient(user.id);
	let folder = await createBoxTestFolder(userClient);
	context.user = user;
	context.appClient = appClient;
	context.client = userClient;
	context.folder = folder;
});

afterAll(async() => {
	await context.folder.dispose();
	await clearUserContent(context.client);
	await context.user.dispose();
	context.folder = null;
	context.user = null;
});

// eslint-disable-next-line no-extend-native
Date.prototype.addDays = function(days) {
	var date = new Date(this.valueOf());
	date.setDate(date.getDate() + days);
	return date;
};

test('test get file information', async() => {
	let testFile = await createBoxTestFile(context.client, path.join(__dirname, '../resources/blank.pdf'));
	try {
		let file = await context.client.files.get(testFile.id);
		expect(file.id).toBe(testFile.id);
		expect(file.type).toBe('file');
		expect(file.name).toBe(testFile.name);
		expect(file.size).toBe(testFile.size);
	} finally {
		await testFile.dispose();
	}
});

test('test get file with custom fields', async() => {
	let testFile = await createBoxTestFile(context.client, path.join(__dirname, '../resources/blank.pdf'));
	try {
		let file = await context.client.files.get(testFile.id, {fields: 'name'});
		expect(file.id).toBe(testFile.id);
		expect(file.type).toBe('file');
		expect(file.name).toBe(testFile.name);
		expect(file.size).toBeUndefined();
	} finally {
		await testFile.dispose();
	}
});

test('test get file with custom dispostion time', async() => {
	let adminClient = getAdminClient();
	let testRetentionPolicy = await createBoxTestRetentionPolicy(adminClient);
	let testFolder = await createBoxTestFolder(adminClient);
	let testFile;
	let retentionPolicyAssignment;
	try {
		retentionPolicyAssignment = await adminClient.retentionPolicies.assign(testRetentionPolicy.id, testFolder.type, testFolder.id);
		testFile = await createBoxTestFile(adminClient, path.join(__dirname, '../resources/blank.pdf'), 'testfile.pdf', testFolder.id);

		let file = await adminClient.files.get(testFile.id, {fields: 'created_at,disposition_at'});
		expect(file.id).toBe(testFile.id);
		expect(file.disposition_at).not.toBeNull();
		let disposeAt = new Date(file.disposition_at);
		let createdAt = new Date(file.created_at);
		expect(createdAt.addDays(1).toLocaleDateString()).toBe(disposeAt.toLocaleDateString());

		let newDisposeAt = new Date(createdAt.addDays(2));
		await adminClient.files.update(testFile.id, {disposition_at: newDisposeAt.toISOString().replace('.000Z', 'Z'), fields: 'disposition_at'});
		file = await adminClient.files.get(testFile.id, {fields: 'disposition_at'});
		disposeAt = new Date(file.disposition_at);
		expect(newDisposeAt.toLocaleDateString()).toBe(disposeAt.toLocaleDateString());
	} finally {
		if (retentionPolicyAssignment) {
			await adminClient.retentionPolicies.deleteAssignment(retentionPolicyAssignment.id);
		}
		await testRetentionPolicy.dispose();
		await testFolder.dispose();
	}
});
