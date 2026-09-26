const skillUrl = 'https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md';
const agentSkillUrl = 'https://docs.typesafe.ai/agent-skill';

export function TypeSafeSkillGuide() {
  return <section className="panel notebook-cell typesafe-skill" aria-labelledby="typesafe-skill-title">
    <span className="cell-number">[1] AGENT SKILL</span>
    <h2 id="typesafe-skill-title">Build with the TypeSafe agent skill</h2>
    <p>TypeSafe’s <a href={skillUrl} target="_blank" rel="noreferrer">official SKILL.md</a> guides a coding agent through designing TypeSafe workflows. It starts with the application’s intended behavior, keeps exact rules and actions in code, then uses JEV for narrow judgments that need semantic understanding. The skill is guidance for the agent; the Run buttons below make the API calls.</p>
    <div className="typesafe-skill-flow">
      <article><span>01 / DEFINE</span><h3>Start with the outcome</h3><p>Decide what your app should select, change, or hand off. Keep deterministic rules in code.</p></article>
      <article><span>02 / ASK</span><h3>Give relevant state</h3><p>Write one clear judgment per question. Define the possible answers in criteria and include a no-match option when needed.</p></article>
      <article><span>03 / COMPOSE</span><h3>Choose a primitive</h3><p><b>Choice</b> selects one option; <b>Score</b> measures degree on ordered levels; <b>Noul</b> estimates whether a condition holds. Independent questions can share one request.</p></article>
      <article><span>04 / VERIFY</span><h3>Use answers in code</h3><p>Inspect probabilities, test representative cases, and set review thresholds from your own data and consequences.</p></article>
    </div>
    <div className="notebook-code-pair"><div><h3>Install for your coding agent</h3><pre>npx skills add typesafe-ai/skills --skill typesafe-ai</pre><p>Choose your agent when prompted. Installation is project-local by default. This is optional for running this notebook.</p></div><div><h3>Example prompt to your agent</h3><pre>Using the TypeSafe skill, design a support-ticket router. Define the state, narrow Choice and Noul questions, a no-match route, and a human-review rule for uncertain cases. Keep routing actions in code.</pre><p>Use the custom request cell below to try the resulting questions with JEV.</p></div></div>
    <p className="typesafe-skill-links"><a href="#jev-playground">Try the request builder ↓</a><a href={agentSkillUrl} target="_blank" rel="noreferrer">Installation and usage guide ↗</a><a href={skillUrl} target="_blank" rel="noreferrer">Read the complete skill ↗</a></p>
  </section>;
}
