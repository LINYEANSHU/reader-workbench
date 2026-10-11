import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',fullyParallel:false,workers:1,timeout:90000,expect:{timeout:15000},use:{viewport:{width:1600,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure'},projects:[{name:'chromium',use:{browserName:'chromium'}}]});
