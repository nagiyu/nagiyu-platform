import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDockerfile, parseBaseMajor, scanDockerfile } from '../check-node-version.mjs';

test('parseBaseMajor は .node-version からメジャーを読む', () => {
  assert.equal(parseBaseMajor('26\n'), '26');
  assert.equal(parseBaseMajor('v26.13.0'), '26');
  assert.equal(parseBaseMajor('lts/*'), null);
});

test('各種イメージのタグからメジャーを読む', () => {
  const content = [
    'FROM node:26-alpine AS base',
    'FROM public.ecr.aws/lambda/nodejs:26 AS lambda',
    'FROM mcr.microsoft.com/devcontainers/javascript-node:26-bookworm',
  ].join('\n');
  const { found, unknown } = scanDockerfile(content);
  assert.deepEqual(found.map((f) => f.major), ['26', '26', '26']);
  assert.equal(unknown.length, 0);
});

test('前のステージを指す FROM は対象外', () => {
  const { found, unknown } = scanDockerfile('FROM node:26-slim AS base\nFROM base AS builder\nFROM builder');
  assert.equal(found.length, 1);
  assert.equal(unknown.length, 0);
});

test('メジャーが違えば行番号つきで落ちる', () => {
  const errors = checkDockerfile('a/Dockerfile', '# c\nFROM node:24-alpine AS base\n', '26');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 2);
  assert.match(errors[0].message, /24/);
});

test('版を読めない外部イメージの FROM は落ちる', () => {
  const errors = checkDockerfile('a/Dockerfile', 'FROM ubuntu:22.04\n', '26');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 1);
});

test('タグが変数の Node イメージは落ちる', () => {
  const errors = checkDockerfile('a/Dockerfile', 'FROM node:${VER}\n', '26');
  assert.equal(errors.length, 1);
});

test('ARG NODE_VERSION があれば Node を持たない FROM は通し、ARG を検査する', () => {
  const content = 'FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS base\nARG NODE_VERSION=26.13.0\n';
  assert.equal(checkDockerfile('a/Dockerfile', content, '26').length, 0);
  const errors = checkDockerfile('a/Dockerfile', content, '27');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 2);
});
