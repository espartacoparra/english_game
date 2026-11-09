/**
 * Raw item pools for the four single-player practice modes.
 *
 * The practice screens render these and the room machine grades them, so the
 * data lives here instead of inline in the components: one importable,
 * dependency-free source for both sides. Item order and wording are the
 * original component data, extracted verbatim.
 */

export interface SynonymItem {
  word: string
  synonyms: string[]
  hint: string
}

export interface AntonymItem {
  word: string
  antonyms: string[]
  hint: string
}

export interface CognateItem {
  english: string
  spanish: string
  category: string
}

export interface FalseCognateItem {
  english: string
  looksLike: string
  realMeaning: string
  falseMeaning: string
  example: string
}

export const SYNONYM_ITEMS: SynonymItem[] = [
  { word: 'big', synonyms: ['large', 'huge', 'enormous', 'giant', 'massive'], hint: 'grande' },
  { word: 'small', synonyms: ['little', 'tiny', 'mini', 'petite', 'compact'], hint: 'pequeño' },
  { word: 'happy', synonyms: ['glad', 'joyful', 'cheerful', 'delighted', 'pleased'], hint: 'feliz' },
  { word: 'sad', synonyms: ['unhappy', 'sorrowful', 'depressed', 'gloomy', 'melancholy'], hint: 'triste' },
  { word: 'fast', synonyms: ['quick', 'rapid', 'swift', 'speedy', 'hasty'], hint: 'rápido' },
  { word: 'slow', synonyms: ['sluggish', 'gradual', 'leisurely', 'unhurried'], hint: 'lento' },
  { word: 'good', synonyms: ['great', 'fine', 'excellent', 'wonderful', 'superb'], hint: 'bueno' },
  { word: 'bad', synonyms: ['evil', 'awful', 'terrible', 'horrible', 'poor'], hint: 'malo' },
  { word: 'smart', synonyms: ['intelligent', 'clever', 'bright', 'wise', 'brilliant'], hint: 'inteligente' },
  { word: 'old', synonyms: ['ancient', 'aged', 'elderly', 'vintage', 'antique'], hint: 'viejo' },
  { word: 'strong', synonyms: ['powerful', 'sturdy', 'robust', 'tough', 'muscular'], hint: 'fuerte' },
  { word: 'weak', synonyms: ['frail', 'feeble', 'fragile', 'delicate'], hint: 'débil' },
  { word: 'beautiful', synonyms: ['pretty', 'lovely', 'gorgeous', 'stunning', 'attractive'], hint: 'hermoso' },
  { word: 'ugly', synonyms: ['hideous', 'unattractive', 'unsightly', 'homely'], hint: 'feo' },
  { word: 'tired', synonyms: ['exhausted', 'weary', 'fatigued', 'drained'], hint: 'cansado' },
  { word: 'angry', synonyms: ['furious', 'mad', 'annoyed', 'irritated', 'enraged'], hint: 'enojado' },
  { word: 'afraid', synonyms: ['scared', 'frightened', 'terrified', 'fearful'], hint: 'asustado' },
  { word: 'brave', synonyms: ['courageous', 'bold', 'fearless', 'valiant'], hint: 'valiente' },
  { word: 'quiet', synonyms: ['silent', 'still', 'hushed', 'peaceful'], hint: 'tranquilo/silencioso' },
  { word: 'loud', synonyms: ['noisy', 'deafening', 'booming', 'blaring'], hint: 'ruidoso' },
  { word: 'begin', synonyms: ['start', 'commence', 'initiate', 'launch'], hint: 'empezar' },
  { word: 'end', synonyms: ['finish', 'conclude', 'terminate', 'complete'], hint: 'terminar' },
  { word: 'help', synonyms: ['assist', 'support', 'aid', 'back'], hint: 'ayudar' },
  { word: 'buy', synonyms: ['purchase', 'acquire', 'obtain'], hint: 'comprar' },
  { word: 'choose', synonyms: ['select', 'pick', 'opt', 'elect'], hint: 'elegir' },
]

export const ANTONYM_ITEMS: AntonymItem[] = [
  { word: 'hot', antonyms: ['cold', 'cool', 'chilly', 'icy', 'frigid'], hint: 'caliente' },
  { word: 'big', antonyms: ['small', 'little', 'tiny', 'miniature'], hint: 'grande' },
  { word: 'happy', antonyms: ['sad', 'unhappy', 'miserable', 'gloomy', 'depressed'], hint: 'feliz' },
  { word: 'fast', antonyms: ['slow', 'sluggish', 'leisurely'], hint: 'rápido' },
  { word: 'good', antonyms: ['bad', 'evil', 'terrible', 'awful', 'horrible'], hint: 'bueno' },
  { word: 'old', antonyms: ['new', 'young', 'modern', 'fresh'], hint: 'viejo' },
  { word: 'rich', antonyms: ['poor', 'broke', 'penniless', 'needy'], hint: 'rico' },
  { word: 'strong', antonyms: ['weak', 'feeble', 'frail', 'fragile'], hint: 'fuerte' },
  { word: 'clean', antonyms: ['dirty', 'filthy', 'grimy', 'unclean'], hint: 'limpio' },
  { word: 'easy', antonyms: ['hard', 'difficult', 'tough', 'challenging'], hint: 'fácil' },
  { word: 'cold', antonyms: ['hot', 'warm', 'heated', 'boiling'], hint: 'frío' },
  { word: 'early', antonyms: ['late', 'delayed', 'tardy'], hint: 'temprano' },
  { word: 'late', antonyms: ['early', 'punctual', 'prompt'], hint: 'tarde' },
  { word: 'high', antonyms: ['low', 'short', 'lowered'], hint: 'alto' },
  { word: 'low', antonyms: ['high', 'tall', 'elevated'], hint: 'bajo' },
  { word: 'long', antonyms: ['short', 'brief', 'compressed'], hint: 'largo' },
  { word: 'full', antonyms: ['empty', 'vacant', 'hollow'], hint: 'lleno' },
  { word: 'empty', antonyms: ['full', 'filled', 'occupied'], hint: 'vacío' },
  { word: 'wide', antonyms: ['narrow', 'tight', 'cramped'], hint: 'ancho' },
  { word: 'narrow', antonyms: ['wide', 'broad', 'spacious'], hint: 'estrecho' },
  { word: 'near', antonyms: ['far', 'distant', 'remote'], hint: 'cerca' },
  { word: 'far', antonyms: ['near', 'close', 'nearby'], hint: 'lejos' },
  { word: 'true', antonyms: ['false', 'untrue', 'fake'], hint: 'verdadero' },
  { word: 'safe', antonyms: ['dangerous', 'risky', 'unsafe'], hint: 'seguro' },
  { word: 'wet', antonyms: ['dry', 'arid', 'parched'], hint: 'mojado' },
]

export const COGNATE_ITEMS: CognateItem[] = [
  { english: 'animal', spanish: 'animal', category: 'General' },
  { english: 'hospital', spanish: 'hospital', category: 'Medical' },
  { english: 'banana', spanish: 'banana', category: 'Food' },
  { english: 'chocolate', spanish: 'chocolate', category: 'Food' },
  { english: 'radio', spanish: 'radio', category: 'Technology' },
  { english: 'musical', spanish: 'musical', category: 'Art' },
  { english: 'natural', spanish: 'natural', category: 'Science' },
  { english: 'electric', spanish: 'eléctrico', category: 'Science' },
  { english: 'capital', spanish: 'capital', category: 'General' },
  { english: 'important', spanish: 'importante', category: 'Adjectives' },
  { english: 'possible', spanish: 'posible', category: 'Adjectives' },
  { english: 'difficult', spanish: 'difícil', category: 'Adjectives' },
  { english: 'television', spanish: 'televisión', category: 'Technology' },
  { english: 'university', spanish: 'universidad', category: 'Education' },
  { english: 'revolution', spanish: 'revolución', category: 'History' },
  { english: 'family', spanish: 'familia', category: 'General' },
  { english: 'color', spanish: 'color', category: 'General' },
  { english: 'class', spanish: 'clase', category: 'Education' },
  { english: 'doctor', spanish: 'doctor/médico', category: 'Medical' },
  { english: 'motor', spanish: 'motor', category: 'Technology' },
  { english: 'professor', spanish: 'profesor', category: 'Education' },
  { english: 'restaurant', spanish: 'restaurante', category: 'Food' },
  { english: 'music', spanish: 'música', category: 'Art' },
  { english: 'victory', spanish: 'victoria', category: 'General' },
  { english: 'emotion', spanish: 'emoción', category: 'Psychology' },
  { english: 'conversation', spanish: 'conversación', category: 'General' },
  { english: 'intelligent', spanish: 'inteligente', category: 'Adjectives' },
  { english: 'incredible', spanish: 'increíble', category: 'Adjectives' },
  { english: 'moment', spanish: 'momento', category: 'General' },
  { english: 'problem', spanish: 'problema', category: 'General' },
  { english: 'accident', spanish: 'accidente', category: 'General' },
  { english: 'action', spanish: 'acción', category: 'General' },
  { english: 'attention', spanish: 'atención', category: 'General' },
  { english: 'biology', spanish: 'biología', category: 'Science' },
  { english: 'camera', spanish: 'cámara', category: 'Technology' },
  { english: 'ceremony', spanish: 'ceremonia', category: 'Culture' },
  { english: 'circle', spanish: 'círculo', category: 'Math' },
  { english: 'civil', spanish: 'civil', category: 'Society' },
  { english: 'complete', spanish: 'completo', category: 'Adjectives' },
  { english: 'confusion', spanish: 'confusión', category: 'Psychology' },
  { english: 'construction', spanish: 'construcción', category: 'Construction' },
  { english: 'culture', spanish: 'cultura', category: 'Culture' },
  { english: 'decoration', spanish: 'decoración', category: 'Art' },
  { english: 'direction', spanish: 'dirección', category: 'General' },
  { english: 'distance', spanish: 'distancia', category: 'Math' },
  { english: 'education', spanish: 'educación', category: 'Education' },
  { english: 'energy', spanish: 'energía', category: 'Science' },
  { english: 'example', spanish: 'ejemplo', category: 'General' },
  { english: 'experiment', spanish: 'experimento', category: 'Science' },
  { english: 'expression', spanish: 'expresión', category: 'Language' },
  { english: 'famous', spanish: 'famoso', category: 'Adjectives' },
  { english: 'future', spanish: 'futuro', category: 'Time' },
  { english: 'geography', spanish: 'geografía', category: 'Science' },
  { english: 'grammar', spanish: 'gramática', category: 'Language' },
  { english: 'history', spanish: 'historia', category: 'History' },
  { english: 'idea', spanish: 'idea', category: 'General' },
  { english: 'imagination', spanish: 'imaginación', category: 'Psychology' },
  { english: 'information', spanish: 'información', category: 'Technology' },
  { english: 'insect', spanish: 'insecto', category: 'Animals' },
  { english: 'international', spanish: 'internacional', category: 'Adjectives' },
]

export const FALSE_COGNATE_ITEMS: FalseCognateItem[] = [
  {
    english: 'actually',
    looksLike: 'actualmente',
    realMeaning: 'en realidad / de hecho',
    falseMeaning: 'actualmente (que significa "currently")',
    example: '"Actually, I don\'t agree" = "En realidad, no estoy de acuerdo"'
  },
  {
    english: 'currently',
    looksLike: 'corriente',
    realMeaning: 'actualmente / en este momento',
    falseMeaning: 'corriente (electric current) o corriente (trendy)',
    example: '"I\'m currently working" = "Actualmente estoy trabajando"'
  },
  {
    english: 'embarrassed',
    looksLike: 'embarazada',
    realMeaning: 'avergonzado/a',
    falseMeaning: 'embarazada (pregnant)',
    example: '"I was embarrassed" = "Me sentí avergonzado"'
  },
  {
    english: 'pregnant',
    looksLike: 'preguntado',
    realMeaning: 'embarazada',
    falseMeaning: 'preguntado (asked)',
    example: '"She\'s pregnant" = "Ella está embarazada"'
  },
  {
    english: 'fabric',
    looksLike: 'fábrica',
    realMeaning: 'tela / tejido',
    falseMeaning: 'fábrica (factory)',
    example: '"This fabric is soft" = "Esta tela es suave"'
  },
  {
    english: 'factory',
    looksLike: 'factoría',
    realMeaning: 'fábrica',
    falseMeaning: 'factoría vs fábrica - "factory" = fábrica',
    example: '"They work in a factory" = "Trabajan en una fábrica"'
  },
  {
    english: 'sensible',
    looksLike: 'sensible',
    realMeaning: 'sensato / razonable',
    falseMeaning: 'sensible (sensitive)',
    example: '"That\'s a sensible decision" = "Esa es una decisión sensata"'
  },
  {
    english: 'sensitive',
    looksLike: 'sensible',
    realMeaning: 'sensible / susceptible',
    falseMeaning: 'sensato (sensible)',
    example: '"She\'s very sensitive" = "Ella es muy sensible"'
  },
  {
    english: 'realize',
    looksLike: 'realizar',
    realMeaning: 'darse cuenta / caer en cuenta',
    falseMeaning: 'realizar (to carry out/make)',
    example: '"I just realized the time!" = "¡Acabo de darme cuenta de la hora!"'
  },
  {
    english: 'realize / accomplish',
    looksLike: 'realizar',
    realMeaning: 'realizar/efectuar (accomplish/carry out)',
    falseMeaning: 'darse cuenta (realize)',
    example: '"She realized her dream" = "Ella realizó su sueño"'
  },
  {
    english: 'sympathetic',
    looksLike: 'simpático',
    realMeaning: 'comprensivo / compasivo',
    falseMeaning: 'simpático/agradable (nice/friendly)',
    example: '"He was very sympathetic" = "Fue muy comprensivo"'
  },
  {
    english: 'nice / friendly',
    looksLike: 'simpático',
    realMeaning: 'simpático / agradable',
    falseMeaning: 'comprensivo (sympathetic)',
    example: '"He\'s a nice person" = "Es una persona simpática"'
  },
  {
    english: 'exit',
    looksLike: 'éxito',
    realMeaning: 'salida',
    falseMeaning: 'éxito (success)',
    example: '"Take the exit on the right" = "Toma la salida a la derecha"'
  },
  {
    english: 'success',
    looksLike: 'suceso',
    realMeaning: 'éxito',
    falseMeaning: 'suceso/evento (event/incident)',
    example: '"The project was a success" = "El proyecto fue un éxito"'
  },
  {
    english: 'event / incident',
    looksLike: 'evento',
    realMeaning: 'suceso / acontecimiento',
    falseMeaning: 'evento (event)',
    example: '"There was a strange event" = "Hubo un suceso extraño"'
  },
  {
    english: 'library',
    looksLike: 'librería',
    realMeaning: 'biblioteca',
    falseMeaning: 'librería (bookstore)',
    example: '"I go to the library to study" = "Voy a la biblioteca a estudiar"'
  },
  {
    english: 'bookstore',
    looksLike: 'librería',
    realMeaning: 'librería',
    falseMeaning: 'biblioteca (library)',
    example: '"I bought this at the bookstore" = "Lo compré en la librería"'
  },
  {
    english: 'parents',
    looksLike: 'parientes',
    realMeaning: 'padres',
    falseMeaning: 'parientes/relativos (relatives)',
    example: '"My parents are here" = "Mis padres están aquí"'
  },
  {
    english: 'relatives',
    looksLike: 'relativos',
    realMeaning: 'parientes / familiares',
    falseMeaning: 'relativos (relatives in grammar)',
    example: '"All my relatives came" = "Vinieron todos mis parientes"'
  },
  {
    english: 'carpet',
    looksLike: 'carpeta',
    realMeaning: 'alfombra',
    falseMeaning: 'carpeta (folder)',
    example: '"The carpet is dirty" = "La alfombra está sucia"'
  },
  {
    english: 'brave',
    looksLike: 'bravo',
    realMeaning: 'valiente',
    falseMeaning: 'bravo (angry/fierce)',
    example: '"He is a brave soldier" = "Él es un soldado valiente"'
  },
  {
    english: 'attend',
    looksLike: 'atender',
    realMeaning: 'asistir (a un evento)',
    falseMeaning: 'atender (to serve/assist)',
    example: '"I will attend the meeting" = "Asistiré a la reunión"'
  },
  {
    english: 'support',
    looksLike: 'soportar',
    realMeaning: 'apoyar',
    falseMeaning: 'soportar (to tolerate/bear)',
    example: '"I support your idea" = "Apoyo tu idea"'
  },
  {
    english: 'assist',
    looksLike: 'asistir',
    realMeaning: 'ayudar',
    falseMeaning: 'asistir (to attend)',
    example: '"Can you assist me?" = "¿Puedes ayudarme?"'
  },
  {
    english: 'rope',
    looksLike: 'ropa',
    realMeaning: 'cuerda / soga',
    falseMeaning: 'ropa (clothes)',
    example: '"Tie the rope to the tree" = "Ata la cuerda al árbol"'
  },
  {
    english: 'pie',
    looksLike: 'pie',
    realMeaning: 'pastel / tarta',
    falseMeaning: 'pie (foot)',
    example: '"I baked an apple pie" = "Hice un pastel de manzana"'
  },
  {
    english: 'red',
    looksLike: 'red',
    realMeaning: 'rojo',
    falseMeaning: 'red (network)',
    example: '"She wore a red dress" = "Ella llevaba un vestido rojo"'
  },
  {
    english: 'arena',
    looksLike: 'arena',
    realMeaning: 'estadio / recinto',
    falseMeaning: 'arena (sand)',
    example: '"The concert is in the arena" = "El concierto es en el estadio"'
  },
  {
    english: 'sane',
    looksLike: 'sano',
    realMeaning: 'cuerdo / en su sano juicio',
    falseMeaning: 'sano (healthy)',
    example: '"That was a sane decision" = "Esa fue una decisión cuerda"'
  },
  {
    english: 'ultimately',
    looksLike: 'últimamente',
    realMeaning: 'en última instancia / finalmente',
    falseMeaning: 'últimamente (lately)',
    example: '"Ultimately, it doesn\'t matter" = "En última instancia, no importa"'
  },
  {
    english: 'eventually',
    looksLike: 'eventualmente',
    realMeaning: 'finalmente / con el tiempo',
    falseMeaning: 'eventualmente (possibly/occasionally)',
    example: '"Eventually, she said yes" = "Con el tiempo, ella dijo que sí"'
  },
  {
    english: 'advice',
    looksLike: 'aviso',
    realMeaning: 'consejo',
    falseMeaning: 'aviso (notice/warning)',
    example: '"Thanks for your advice" = "Gracias por tu consejo"'
  },
  {
    english: 'notice',
    looksLike: 'noticia',
    realMeaning: 'aviso / letrero / notar',
    falseMeaning: 'noticia (news)',
    example: '"I didn\'t notice the sign" = "No me di cuenta del letrero"'
  },
  {
    english: 'argument',
    looksLike: 'argumento',
    realMeaning: 'discusión / pelea',
    falseMeaning: 'argumento (plot/reasoning)',
    example: '"They had an argument" = "Tuvieron una discusión"'
  },
  {
    english: 'gang',
    looksLike: 'ganga',
    realMeaning: 'pandilla / banda',
    falseMeaning: 'ganga (bargain)',
    example: '"A gang robbed the store" = "Una pandilla robó la tienda"'
  },
  {
    english: 'large',
    looksLike: 'largo',
    realMeaning: 'grande',
    falseMeaning: 'largo (long)',
    example: '"They live in a large house" = "Viven en una casa grande"'
  },
  {
    english: 'mayor',
    looksLike: 'mayor',
    realMeaning: 'alcalde',
    falseMeaning: 'mayor (older)',
    example: '"The mayor gave a speech" = "El alcalde dio un discurso"'
  },
  {
    english: 'once',
    looksLike: 'once',
    realMeaning: 'una vez',
    falseMeaning: 'once (eleven)',
    example: '"I only went once" = "Solo fui una vez"'
  },
  {
    english: 'pretend',
    looksLike: 'pretender',
    realMeaning: 'fingir',
    falseMeaning: 'pretender (to intend/aspire)',
    example: '"Don\'t pretend to be asleep" = "No finjas estar dormido"'
  },
  {
    english: 'record',
    looksLike: 'recordar',
    realMeaning: 'grabar / récord',
    falseMeaning: 'recordar (to remember)',
    example: '"They record the song" = "Ellos graban la canción"'
  },
]
