# Existore (Demo)

Site estático de demonstração para uma loja de hardware e periféricos em tema roxo, com carrinho simples em JavaScript usando `localStorage`.

## Páginas
- `index.html` (Inicial): Lista de produtos, busca, filtros por categoria e faixa de preço.
- `about.html` (Quem Somos): Informações institucionais.
- `profile.html` (Perfil): Área de usuário fictícia + resumo do carrinho.

## Funcionalidades
- Adição de produtos ao carrinho com contagem e total.
- Persistência do carrinho entre páginas via `localStorage`.
- Filtro: texto (nome), categoria e preço mínimo/máximo.
- Layout responsivo básico.

## Executar Localmente (Windows PowerShell)
Basta abrir os arquivos `.html` diretamente no navegador ou subir um servidor simples:

```powershell
# Opcional: servidor Python se instalado
python -m http.server 8000
# Depois abra http://localhost:8000
```

## Estrutura
```
loja/
  index.html
  about.html
  profile.html
  assets/
    css/style.css
    js/app.js
```

## Próximos Passos Sugeridos
- Autenticação real e área de perfil dinâmica.
- Imagens reais dos produtos e integração com backend.
- Paginação / lazy loading.
- Checkout com cálculo de frete.

## Licença
Uso livre para estudo/demonstração.
