import { IDiscussionProvider, DiscussionContext } from '@/types/providers';
import { Participant, TranscriptTurn } from '@/types/session';
import { MODERATOR } from '@/constants/participants';

let turnCounter = 0;
function generateTurnId(): string {
  turnCounter += 1;
  return `turn-${Date.now()}-${turnCounter}`;
}

function getAaravContent(peerName: string, topic: string, isHinglish: boolean, turnIndex: number): string {
  if (isHinglish) {
    return turnIndex % 2 === 0
      ? `I respectfully disagree with ${peerName}. Humein surface-level arguments se aage badhna hoga. Jab hum "${topic}" discuss karte hain, the real bottleneck is lack of accountability and execution speed.`
      : `Dekho, optimistic baatein karna aasan hai. But let's be blunt: agar foundational metrics fix nahi honge, toh "${topic}" will collapse under pressure. What is our concrete action plan?`;
  }
  return turnIndex % 2 === 0
    ? `I have to challenge ${peerName}'s baseline assumption here. When analyzing "${topic}", we cannot afford wishful thinking. The bottleneck is operational execution and accountability.`
    : `Let us address the elephant in the room regarding "${topic}". Being passive will cost organizations heavily. We need decisive guidelines rather than vague assurances.`;
}

function getMeeraContent(topic: string, isHinglish: boolean, turnIndex: number): string {
  if (isHinglish) {
    return turnIndex % 2 === 0
      ? `Aarav makes an energetic argument, but let's examine the numbers. Agar hum historical data dekhein, "${topic}" me short-term disruptions zaroor hote hain, but long-term ROI is consistently net-positive.`
      : `Humein second-order effects consider karne padenge. In the context of "${topic}", 30% initial attrition ya overhead cost inevitable hai, but compliance frameworks minimize systemic risks.`;
  }
  return turnIndex % 2 === 0
    ? `While Aarav makes an impassioned case, let us scrutinize the empirical evidence. When we evaluate "${topic}", quantitative studies show that the long-term gains outweigh the initial transitional friction.`
    : `We need to weigh the tangible cost-benefit matrix. On "${topic}", premature conclusions ignore the statistical reality of how modern enterprises scale while managing downside risk.`;
}

function getKabirContent(topic: string, isHinglish: boolean, turnIndex: number): string {
  if (isHinglish) {
    return turnIndex % 2 === 0
      ? `If I may add a calm observation: we are debating extremes. "${topic}" isn't a binary win or loss; it's about whether human empathy and ethics keep pace with rapid shifts.`
      : `Short point: technology and policies exist for people, not vice-versa. Jo bhi framework bane "${topic}" par, entry-level candidates aur vulnerable groups ki dignity preserve honi chahiye.`;
  }
  return turnIndex % 2 === 0
    ? `If I may introduce a quiet observation: we are polarizing the discussion into extremes. "${topic}" is fundamentally about whether human ethics and empathy remain at the center.`
    : `A concise thought: systems exist to serve people. Any policy decision around "${topic}" must safeguard individual dignity rather than treating candidates purely as statistics.`;
}

function getRiyaContent(topic: string, isHinglish: boolean, turnIndex: number): string {
  if (isHinglish) {
    return turnIndex % 2 === 0
      ? `This reminds me of what happened in my friend's startup recently! Jab unhone "${topic}" implement kiya, unexpected cultural friction ho gayi thi. We should also think about psychology and social habits.`
      : `Adding a different angle: consumer behaviour aur daily campus habits ko ignore nahi kar sakte. "${topic}" sirf boardroom decision nahi hai, everyday lifestyle par impact padta hai.`;
  }
  return turnIndex % 2 === 0
    ? `This connects directly to what we see across modern campuses and startups. When you look at "${topic}" through the lens of young professionals, peer psychology and workplace culture play a massive role.`
    : `Let me introduce a practical real-world parallel. When dealing with "${topic}", consumer sentiment and daily lifestyle shifts frequently override theoretical models.`;
}

function getDevContent(topic: string, isHinglish: boolean, turnIndex: number): string {
  if (isHinglish) {
    return turnIndex % 2 === 0
      ? `Both Aarav's urgency and Meera's analytical caution are valid. Agar hum dono ko bridge karein, toh "${topic}" ke liye a phased rollout with agile feedback loops is the ideal consensus.`
      : `Panel members, let's look at common ground. Kabir highlighted human values, while Meera gave data. Synthesizing this: "${topic}" requires balanced regulation without choking innovation.`;
  }
  return turnIndex % 2 === 0
    ? `Synthesizing the discussion so far: Aarav brings urgency while Meera highlights empirical caution. The convergence for "${topic}" lies in a staged adoption model with strict safety margins.`
    : `We actually have strong agreement on core fundamentals. Combining Kabir's human-centric view with our operational data gives us a robust, mutually agreed path forward on "${topic}".`;
}

function getScriptedContentForSpeaker(
  speaker: Participant,
  peerName: string,
  topic: string,
  isHinglish: boolean,
  turnIndex: number
): string {
  switch (speaker.id) {
    case 'ai-aarav':
      return getAaravContent(peerName, topic, isHinglish, turnIndex);
    case 'ai-meera':
      return getMeeraContent(topic, isHinglish, turnIndex);
    case 'ai-kabir':
      return getKabirContent(topic, isHinglish, turnIndex);
    case 'ai-riya':
      return getRiyaContent(topic, isHinglish, turnIndex);
    case 'ai-dev':
      return getDevContent(topic, isHinglish, turnIndex);
    default:
      return `Regarding "${topic}", it is essential that we evaluate both short-term constraints and long-term implications responsibly.`;
  }
}

function getAckTextHinglish(speakerId: string, snippet: string): string {
  if (speakerId === 'ai-aarav') {
    return `I appreciate Candidate's point on "${snippet}". Lekin assume mat kijiye ki execution itna straightforward hoga. Real challenges ground implementation mein aate hain.`;
  }
  if (speakerId === 'ai-meera') {
    return `Candidate ne jo point raise kiya regarding "${snippet}", that adds a crucial variable. Agar hum empirical data check karein, toh yeh perspective kaafi validated lagta hai.`;
  }
  if (speakerId === 'ai-kabir') {
    return `Candidate's intervention is very balanced. Hum aksar extreme sides dekhne lagte hain, but this nuance matters.`;
  }
  if (speakerId === 'ai-dev') {
    return `Candidate has linked two opposite sides together with this point. Let's integrate this insight as we move forward.`;
  }
  return `Candidate makes a very relatable point here. Mere observation mein bhi yeh practical trend kaafi visible hai.`;
}

function getAckTextEnglish(speakerId: string, snippet: string): string {
  if (speakerId === 'ai-aarav') {
    return `I strongly respect the candidate's input on "${snippet}", but let's not overlook the ground reality. There are significant hurdles we cannot ignore.`;
  }
  if (speakerId === 'ai-meera') {
    return `That is a vital perspective shared by the candidate. Evaluating the trade-offs on "${snippet}", the operational impact becomes much clearer.`;
  }
  if (speakerId === 'ai-kabir') {
    return `The candidate highlights a thoughtful point. In group discussions, identifying this underlying root cause is what truly moves us forward.`;
  }
  if (speakerId === 'ai-dev') {
    return `Building directly on the candidate's contribution regarding "${snippet}", this actually bridges our earlier divide and gives us a workable path.`;
  }
  return `I completely relate to what the candidate just highlighted. It mirrors what is happening in the current market right now.`;
}

export class DemoDiscussionProvider implements IDiscussionProvider {
  public readonly name = 'Deterministic Demo Engine';
  public readonly isDemo = true;

  public getOpeningTurn(context: DiscussionContext): Promise<TranscriptTurn> {
    const isHinglish = context.config.language === 'hinglish';
    const topic = context.config.topic;
    const duration = context.config.durationMinutes;

    const openingText = isHinglish
      ? `Good morning everyone. Welcome to this Group Discussion session. Hamara topic hai: "${topic}". Session ka duration ${duration} minutes hai. Please maintain professional decorum, respect fellow speakers, and feel free to share diverse viewpoints. Candidate and panel members, the floor is open. Let's begin.`
      : `Good morning everyone, and welcome to this Group Discussion session. Our topic for today is: "${topic}". We have an allocated duration of ${duration} minutes. Please maintain mutual respect, build on each other's points, and structure your arguments well. Candidate and panel members, the floor is now open. Who would like to start?`;

    return Promise.resolve({
      id: generateTurnId(),
      speakerId: MODERATOR.id,
      speakerName: MODERATOR.name,
      speakerRole: 'moderator',
      text: openingText,
      relativeTimestampMs: 0,
      source: 'scripted-demo',
      deliveryState: 'complete',
      isDemoResponse: false
    });
  }

  public getNextTurn(context: DiscussionContext): Promise<TranscriptTurn | null> {
    const { config, participants, transcript } = context;
    const isHinglish = config.language === 'hinglish';
    const topic = config.topic;

    const aiParticipants = participants.filter((p) => p.role === 'ai_participant');
    if (aiParticipants.length === 0) return Promise.resolve(null);

    const lastTurn = transcript[transcript.length - 1];
    const previousSpeakerId = lastTurn ? lastTurn.speakerId : null;

    const availableSpeakers = aiParticipants.filter((p) => p.id !== previousSpeakerId);
    const chosenSpeaker = availableSpeakers.length > 0
      ? availableSpeakers[transcript.length % availableSpeakers.length]
      : aiParticipants[0];

    const otherAi = aiParticipants.find((p) => p.id !== chosenSpeaker.id);
    const peerName = otherAi ? otherAi.name : 'the panel';

    const text = getScriptedContentForSpeaker(
      chosenSpeaker,
      peerName,
      topic,
      isHinglish,
      transcript.length
    );

    return Promise.resolve({
      id: generateTurnId(),
      speakerId: chosenSpeaker.id,
      speakerName: chosenSpeaker.name,
      speakerRole: chosenSpeaker.role,
      text,
      relativeTimestampMs: Date.now(),
      source: 'scripted-demo',
      deliveryState: 'complete',
      isDemoResponse: true,
      replyToSpeakerId: previousSpeakerId || undefined
    });
  }

  public acknowledgeStudentContribution(
    context: DiscussionContext,
    nextSpeaker: Participant,
    studentTurn: TranscriptTurn
  ): Promise<TranscriptTurn> {
    const isHinglish = context.config.language === 'hinglish';
    const snippet = studentTurn.text.length > 45
      ? studentTurn.text.substring(0, 42) + '...'
      : studentTurn.text;

    const acknowledgement = isHinglish
      ? getAckTextHinglish(nextSpeaker.id, snippet)
      : getAckTextEnglish(nextSpeaker.id, snippet);

    return Promise.resolve({
      id: generateTurnId(),
      speakerId: nextSpeaker.id,
      speakerName: nextSpeaker.name,
      speakerRole: nextSpeaker.role,
      text: acknowledgement,
      relativeTimestampMs: Date.now(),
      source: 'scripted-demo',
      deliveryState: 'complete',
      isDemoResponse: true,
      replyToSpeakerId: studentTurn.speakerId
    });
  }

  public getClosingTurn(
    context: DiscussionContext,
    speaker: Participant,
    isStudentInvited: boolean
  ): Promise<TranscriptTurn> {
    const isHinglish = context.config.language === 'hinglish';
    const topic = context.config.topic;

    let text = '';
    if (speaker.role === 'moderator') {
      if (isStudentInvited) {
        text = isHinglish
          ? `Panel members, we are nearing the scheduled time. Let us begin our concluding round. Candidate, would you like to present your concluding thoughts and summary for "${topic}" first?`
          : `Panel members, our time is almost up. Let's move into our concluding summary round. Candidate, would you like to present your concluding perspective on "${topic}" first?`;
      } else {
        text = isHinglish
          ? `Thank you everyone for a structured and respectful deliberation on "${topic}". We have mapped out the core opportunities, operational trade-offs, and future trajectories. This officially concludes today's GD session.`
          : `Thank you everyone for an articulate and well-reasoned discussion on "${topic}". We have weighed both the practical benefits and regulatory hurdles. This concludes our group discussion.`;
      }
    } else if (isHinglish) {
      text = `Concluding my view: "${topic}" par extreme stance lena sahi nahi hoga. Continuous upskilling aur regulatory safeguards ke saath hi sustainable solution niklega.`;
    } else {
      text = `To conclude my stance: on "${topic}", the balanced takeaway is that proactive adaptation combined with strong guardrails will determine long-term success.`;
    }

    return Promise.resolve({
      id: generateTurnId(),
      speakerId: speaker.id,
      speakerName: speaker.name,
      speakerRole: speaker.role,
      text,
      relativeTimestampMs: Date.now(),
      source: 'scripted-demo',
      deliveryState: 'complete',
      isDemoResponse: speaker.role !== 'moderator'
    });
  }
}

export const demoDiscussionProvider = new DemoDiscussionProvider();
