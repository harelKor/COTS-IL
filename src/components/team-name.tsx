import { teamDisplay, type TeamRef } from "@/domain/display";

/** A team as "<name> <program> <number>", isolated so a Hebrew or Latin name never reorders the text around it. */
export function TeamName({ team, className }: { team: TeamRef; className?: string }) {
  return <bdi className={className}>{teamDisplay(team)}</bdi>;
}
