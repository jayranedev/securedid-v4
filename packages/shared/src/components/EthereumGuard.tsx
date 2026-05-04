export function EthereumGuard() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){var d=Object.defineProperty;Object.defineProperty=function(o,p,desc){if(p==='ethereum'&&o===window){try{return d(o,p,desc);}catch(e){return o;}}return d(o,p,desc);};})();`,
      }}
    />
  );
}
