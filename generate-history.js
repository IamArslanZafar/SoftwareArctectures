#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = process.argv.slice(2);

function getArg(name, defaultValue) {
    const index = args.indexOf(`--${name}`);
    return index !== -1 && args[index + 1]
        ? args[index + 1]
        : defaultValue;
}

function hasFlag(flag) {
    return args.includes(`--${flag}`);
}

const YEAR = parseInt(getArg("year", new Date().getFullYear()));

const START = getArg("start", `${YEAR}-01-01`);
const END = getArg("end", `${YEAR}-12-31`);

const MIN_COMMITS = parseInt(getArg("min", "2"));
const MAX_COMMITS = parseInt(getArg("max", "10"));

const SKIP_PERCENT = parseInt(getArg("skip", "20"));

const WEEKEND_MODE = hasFlag("weekend");

const FILE = path.join(__dirname, "history.json");

const COMMIT_MESSAGES = [
    "feat: add new feature",
    "fix: resolve issue",
    "refactor: improve code",
    "docs: update docs",
    "style: formatting",
    "test: add tests",
    "build: update project",
    "perf: optimize",
    "chore: maintenance",
    "ci: update workflow"
];

function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
    return arr[random(0, arr.length - 1)];
}

function randomTime(date) {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        random(8, 22),
        random(0, 59),
        random(0, 59)
    );
}

const startDate = new Date(`${START}T00:00:00`);
const endDate = new Date(`${END}T00:00:00`);

let commitsCreated = 0;
let skippedDays = 0;

const totalDays =
    Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

let processed = 0;

console.log(`Generating commits...`);

for (
    let current = new Date(startDate);
    current <= endDate;
    current.setDate(current.getDate() + 1)
) {
    processed++;

    process.stdout.write(
        `\rDay ${processed}/${totalDays} | Commits: ${commitsCreated}`
    );

    // Skip chance
    if (random(1, 100) <= SKIP_PERCENT) {
        skippedDays++;
        continue;
    }

    let min = MIN_COMMITS;
    let max = MAX_COMMITS;

    if (WEEKEND_MODE) {
        const day = current.getDay();

        // Sunday or Saturday
        if (day === 0 || day === 6) {
            min = 0;
            max = Math.min(3, MAX_COMMITS);
        }
    }

    const commitsToday = random(min, max);

    for (let i = 0; i < commitsToday; i++) {

        const commitDate = randomTime(current);

        const data = {
            commit: commitsCreated + 1,
            date: commitDate.toISOString(),
            random: Math.random()
        };

        fs.writeFileSync(FILE, JSON.stringify(data, null, 2));

        execSync("git add .");

        execSync(`git commit -m "${randomItem(COMMIT_MESSAGES)}"`, {
            env: {
                ...process.env,
                GIT_AUTHOR_DATE: commitDate.toISOString(),
                GIT_COMMITTER_DATE: commitDate.toISOString()
            },
            stdio: "ignore"
        });

        commitsCreated++;
    }
}

console.log("\n");
console.log("=================================");
console.log("Finished!");
console.log("=================================");
console.log(`Year           : ${YEAR}`);
console.log(`Start          : ${START}`);
console.log(`End            : ${END}`);
console.log(`Skipped Days   : ${skippedDays}`); 
console.log(`Total Commits  : ${commitsCreated}`);
console.log("=================================");