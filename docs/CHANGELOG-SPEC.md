# CHANGELOG-SPEC

## 1.0.1 (implementação do MVP)
- 6.9 DFC: a variação da PDD usa o saldo (ΔPDD = perdas − baixas), não só a despesa; caso contrário a baixa de recebíveis inadimplentes desbalanceia o fluxo.
- 5.4 Cartão: o contas a receber do cartão é registrado líquido da taxa (MDR), que é despesa na venda; a liquidação recebe o valor líquido.
- 6.12 Acrescentada C10_caixaDireto: caixa pelo método direto (independente) deve igualar o caixa do BP obtido pelo DFC indireto.
- 6.10 runway: queima = -(média de FCO + captações − amortizações) dos últimos 3 meses.
- Indicadores mensais anualizam retornos (×12/n); "Juros" = despesas financeiras totais.
- Fora do MVP (v1): IR por regime, vendaAtivo, overrides (T4), versões, IA, import/export.
