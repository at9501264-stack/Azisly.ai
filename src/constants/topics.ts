export interface GDTopic {
  id: string;
  title: string;
  category: 'Tech & AI' | 'Workplace' | 'Policy & Economy' | 'Ethics & Society';
  contextBrief: string;
}

export const PRESET_TOPICS: GDTopic[] = [
  {
    id: 'ai-jobs',
    title: 'Is AI going to eliminate entry-level software engineering jobs?',
    category: 'Tech & AI',
    contextBrief: 'Evaluating the impact of generative coding tools, juniors vs. seniors, and shifting skill demands.'
  },
  {
    id: 'wfh-vs-rto',
    title: 'Work From Home vs. Return To Office: What is ideal for fresh graduates?',
    category: 'Workplace',
    contextBrief: 'Balancing mentorship, corporate culture, work-life flexibility, and onboarding effectiveness.'
  },
  {
    id: 'ev-transition',
    title: 'Electric Vehicles: Is India ready for a full transition by 2030?',
    category: 'Policy & Economy',
    contextBrief: 'Analyzing grid capacity, battery supply chains, public charging infra, and affordability.'
  },
  {
    id: 'college-degrees',
    title: 'Should college degrees still be mandatory in the tech industry?',
    category: 'Tech & AI',
    contextBrief: 'Comparing formal theoretical foundations against self-taught bootcamps, certifications, and portfolio proof.'
  },
  {
    id: 'data-privacy',
    title: 'Data Privacy vs. National Security: Where should the line be drawn?',
    category: 'Ethics & Society',
    contextBrief: 'Examining surveillance laws, end-to-end encryption, digital personal data protection, and civic rights.'
  },
  {
    id: 'gig-economy',
    title: 'Gig Economy: Empowerment or Exploitation of Youth?',
    category: 'Policy & Economy',
    contextBrief: 'Assessing flexible work opportunities, platform accountability, social security nets, and career longevity.'
  },
  {
    id: 'moonlighting',
    title: 'Moonlighting in Tech Companies: Ethical breach or employee right?',
    category: 'Workplace',
    contextBrief: 'Discussing dual employment, intellectual property conflicts, burnout, and freelance freedom.'
  },
  {
    id: 'social-media',
    title: 'Social Media Influencer Culture: Value creator or productivity drain?',
    category: 'Ethics & Society',
    contextBrief: 'Exploring marketing innovation, mental health effects, consumerism, and youth attention span.'
  }
];
