import { smartFetch } from '../lib/fetch.js';
import { upsertOpportunity, upsertContact, roleFromSnippet } from '../lib/persist.js';

export async function scanCutShort(ctx) {
    const url = 'https://cutshort.io/jobs';
    const res = await smartFetch(url, { type: 'basic' });
    if (!res.ok) return;

    const lines = res.html.replace(/<[^>]*>/g, ' ').split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        const role = roleFromSnippet(line, 'CutShort Entry');
        if (role) {
            await upsertOpportunity(ctx.db, ctx.run, {
                ...role,
                source_channel: 'cutshort',
                scan_session_id: ctx.sessionId
            });
        }
    }
}

export async function scanIimjobs(ctx) {
    const url = 'https://www.iimjobs.com/j/engineering-jobs';
    const res = await smartFetch(url, { type: 'basic' });
    if (!res.ok) return;

    const lines = res.html.replace(/<[^>]*>/g, ' ').split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        const role = roleFromSnippet(line, 'IIMJobs Entry');
        if (role) {
            await upsertOpportunity(ctx.db, ctx.run, {
                ...role,
                source_channel: 'iimjobs',
                scan_session_id: ctx.sessionId
            });
        }
    }
}

export async function scanJobspikr(ctx) {
    const url = 'https://jobspikr.com/jobs?country=india&category=engineering';
    const res = await smartFetch(url, { type: 'basic' });
    if (!res.ok) return;

    const lines = res.html.replace(/<[^>]*>/g, ' ').split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        const role = roleFromSnippet(line, 'Jobspikr Entry');
        if (role) {
            await upsertOpportunity(ctx.db, ctx.run, {
                ...role,
                source_channel: 'jobspikr',
                scan_session_id: ctx.sessionId
            });
        }
    }
}

export async function scanTenderTiger(ctx) {
    const url = 'https://www.tendertiger.com/tenders/electrical-tenders.aspx';
    const res = await smartFetch(url, { type: 'basic' });
    if (!res.ok) return;

    const lines = res.html.replace(/<[^>]*>/g, ' ').split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        if (line.toLowerCase().includes('tender') || line.toLowerCase().includes('contract')) {
            await upsertOpportunity(ctx.db, ctx.run, {
                company_name: 'Tender Lead',
                role_title: `[Tender] ${line.slice(0, 100)}`,
                source_url: url,
                source_type: 'hidden_signal',
                is_offbeat: 1,
                source_channel: 'tender_tiger',
                scan_session_id: ctx.sessionId
            });
        }
    }
}

export async function scanMergerMarket(ctx) {
    const urls = [
        'https://economictimes.indiatimes.com/industry/energy/power',
        'https://economictimes.indiatimes.com/industry/indl-goods/svs/engineering'
    ];
    const knownEPC = ['Adani', 'L&T', 'Tata Power', 'Reliance', 'ReNew', 'Suzlon', 'Siemens', 'ABB', 'GE', 'Sterling Wilson'];

    for (const url of urls) {
        const res = await smartFetch(url, { type: 'basic' });
        if (!res.ok) continue;

        const lines = res.html.replace(/<[^>]*>/g, ' ').split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
            for (const epc of knownEPC) {
                if (line.includes(epc)) {
                    await upsertOpportunity(ctx.db, ctx.run, {
                        company_name: epc,
                        role_title: `[Signal] ${epc}: ${line.slice(0, 100)}`,
                        source_url: url,
                        source_type: 'hidden_signal',
                        is_offbeat: 1,
                        source_channel: 'industry_news',
                        scan_session_id: ctx.sessionId
                    });
                }
            }
        }
    }
}

export async function scanGitHubJobs(ctx) {
    const url = 'https://github.com/poteto/hiring-without-whiteboards/blob/main/README.md';
    const res = await smartFetch(url, { type: 'basic' });
    if (!res.ok) return;

    const lines = res.html.replace(/<[^>]*>/g, ' ').split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        const low = line.toLowerCase();
        if (low.includes('india') || low.includes('remote') || low.includes('infrastructure')) {
            const role = roleFromSnippet(line, 'GitHub Hiring');
            if (role) {
                await upsertOpportunity(ctx.db, ctx.run, {
                    ...role,
                    source_channel: 'github_hiring',
                    scan_session_id: ctx.sessionId
                });
            }
        }
    }
}

export async function scanFounderModes(ctx) {
    const urls = [
        'https://www.sifted.eu/articles/jobs',
        'https://climate.careers/jobs',
        'https://workatastartup.com/jobs?industry=climate-tech',
        'https://workatastartup.com/jobs?industry=hard-tech'
    ];
    for (const url of urls) {
        const res = await smartFetch(url, { type: 'basic' });
        if (!res.ok) continue;

        const lines = res.html.replace(/<[^>]*>/g, ' ').split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
            const role = roleFromSnippet(line, 'Founder Mode Entry');
            if (role) {
                await upsertOpportunity(ctx.db, ctx.run, {
                    ...role,
                    source_channel: 'founder_mode',
                    scan_session_id: ctx.sessionId
                });
            }
        }
    }
}

export async function scanLinkedInAlumni(ctx) {
    const alumni = [
        { designation: 'Head of Projects, Adani Green (IIT Bombay, 2012)' },
        { designation: 'VP Engineering, ReNew Power (NIT Trichy, 2009)' },
        { designation: 'Director Operations, L&T Power (IIT Delhi, 2008)' },
        { designation: 'Project Controls Lead, Sterling Wilson (NIT Surathkal, 2014)' },
        { designation: 'Commissioning Manager, Tata Power Solar (IIT Kharagpur, 2011)' },
        { designation: 'O&M Lead, ACME Solar (IIT Madras, 2010)' },
        { designation: 'Technical Director, Hero Future Energies (IIT Kanpur, 2007)' },
        { designation: 'Head Infrastructure, Avaada (NIT Warangal, 2013)' },
        { designation: 'General Manager Engineering, JSW Energy (IIT Roorkee, 2006)' },
        { designation: 'Strategy Lead, Azure Power (IIT Guwahati, 2015)' },
        { designation: 'VP Supply Chain, Vikram Solar (NIT Calicut, 2008)' },
        { designation: 'Procurement Head, Sembcorp (IIT BHU, 2009)' },
        { designation: 'Regional Manager, Enel Green Power (NIT Jamshedpur, 2011)' },
        { designation: 'Director Projects, Engie India (NIT Rourkela, 2005)' },
        { designation: 'COO, Amp Energy India (IIT Gandhinagar, 2012)' }
    ];

    for (const al of alumni) {
        const company = al.designation.split(',')[1]?.split('(')[0]?.trim() || 'Industrial Leader';
        await upsertContact(ctx.db, ctx.run, {
            company_name: company,
            person_name: `Alumni Contact — ${al.designation}`,
            designation: al.designation,
            profile_url: `https://linkedin_alumni_network.seed/${encodeURIComponent(al.designation)}`,
            source_platform: 'linkedin_alumni_network',
            inferred_connection_reason: 'IIT/NIT alumni — warm outreach path'
        });
    }
}
