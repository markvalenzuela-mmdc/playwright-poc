set shell := ["pwsh.exe", "-NoLogo", "-NoProfile", "-Command"]

default: run-flow

run-flow:
    pnpm run db:up
    pnpm run db:migrate
    pnpm run test:website:db
    pnpm run allure:db
    pnpm run allure:open:db
