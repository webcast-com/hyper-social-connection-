import React from "react";
import { slugify } from "../utils/entities";
import { IconTrophy } from "./Icons";
import { MaybeLink, Panel, PanelHead, TeamLogo } from "./ui";

export function StandingsPanel({ groups = [], nfl = false, note = "Sample table", teamBasePath }) {
  return (
    <Panel className="sh-standings-panel">
      <PanelHead
        icon={<IconTrophy size={15} />}
        title={nfl ? "Conference & division standings" : "League standings"}
        note={note}
      />

      <div className="sh-standings-grid">
        {groups.map((group) => (
          <div className="sh-standings-card" key={group.group}>
            <div className="sh-standings-title">{group.group}</div>
            <div className="sh-table-wrap">
              <table className="sh-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>GP</th>
                    <th>W</th>
                    <th>L</th>
                    {nfl ? <th>T</th> : null}
                    <th>PCT</th>
                    {nfl ? (
                      <>
                        <th>PF</th>
                        <th>PA</th>
                      </>
                    ) : (
                      <>
                        <th>GB</th>
                        <th>STRK</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, index) => (
                    <tr key={row.code}>
                      <td>
                        <span className="sh-team-cell">
                          <span className="sh-rank">{index + 1}</span>
                          <TeamLogo src={row.logo} code={row.code} size="xs" />
                          {teamBasePath ? (
                            <MaybeLink
                              className="sh-team-name-cell sh-team-link"
                              to={`${teamBasePath}/team/${slugify(row.team)}`}
                              title={row.team}
                            >
                              {row.team}
                            </MaybeLink>
                          ) : (
                            <span className="sh-team-name-cell" title={row.team}>{row.team}</span>
                          )}
                        </span>
                      </td>
                      <td>{row.p}</td>
                      <td className="sh-positive">{row.w}</td>
                      <td>{row.l}</td>
                      {nfl ? <td>{row.t}</td> : null}
                      <td>{row.pct}</td>
                      {nfl ? (
                        <>
                          <td>{row.pf}</td>
                          <td>{row.pa}</td>
                        </>
                      ) : (
                        <>
                          <td>{row.gb}</td>
                          <td>{row.streak}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function StatTiles({ stats = [], title = "Competition snapshot", note = "Overview" }) {
  return (
    <Panel className="sh-stats-panel">
      <PanelHead title={title} note={note} />
      <div className="sh-stat-grid">
        {stats.map((stat) => (
          <div className="sh-stat" key={stat.label}>
            <span className="sh-stat-label">{stat.label}</span>
            <span className="sh-stat-value">{stat.value}</span>
            <span className="sh-stat-foot">{stat.foot}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
