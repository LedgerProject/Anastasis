import { FunctionalComponent, h } from "preact";
import { TranslationProvider } from "../context/translation";
import AnastasisClient from "../pages/home";

const App: FunctionalComponent = () => {
  return (
    <TranslationProvider>
      <div id="app" class="has-navbar-fixed-top">
        <AnastasisClient />
      </div>
    </TranslationProvider>
  );
};

export default App;
