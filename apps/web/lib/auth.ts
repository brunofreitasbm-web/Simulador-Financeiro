/** Lista de e-mails autorizados. Deve coincidir com a função SQL public.sim_autorizado(). */
export const EMAILS_AUTORIZADOS = ['brunofreitasbm@gmail.com', 'isabella.vgoncalves@gmail.com']

export const emailAutorizado = (email: string | null | undefined) =>
  !!email && EMAILS_AUTORIZADOS.includes(email.trim().toLowerCase())
